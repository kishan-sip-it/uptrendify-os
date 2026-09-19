import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_RUN_RESEARCH, CAN_VIEW_DASHBOARD, requireOrgRole } from '@/lib/auth/roles';
import { completeReplayResearchRun, isReplayOrganization } from '@/lib/replay';
import { scheduleResearchExecution } from '@/lib/research/pipeline';
import { RESEARCH_ACTIVE_STATUSES } from '@/lib/research/crawler';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid() });

const bodySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9:_-]+$/).optional(),
});

function isNoRowsError(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST116';
}

async function loadBrand(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, brandId: string, organizationId: string) {
  const result = await supabase
    .from('brands')
    .select('id,name,website_url')
    .eq('id', brandId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as { id: string; name: string; website_url: string | null } | null;
}

async function abandonRun(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  { researchRunId, organizationId, errorMessage }: { researchRunId: string; organizationId: string; errorMessage: string },
) {
  const result = await supabase
    .from('research_runs')
    .update({ status: 'FAILED', finished_at: new Date().toISOString(), error_code: 'RESEARCH_START_FAILED', error_message: errorMessage })
    .eq('id', researchRunId)
    .eq('organization_id', organizationId)
    .in('status', [...RESEARCH_ACTIVE_STATUSES]);
  if (result.error) {
    obs.error('Failed to release research run after start failure', { researchRunId, error: result.error.message });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  let startedRun: { id: string; organizationId: string } | null = null;
  try {
    const resolvedParams = paramsSchema.safeParse(await params);
    if (!resolvedParams.success) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    const brandId = resolvedParams.data.brandId;

    let rawBody: unknown = {};
    try {
      const json = await request.json();
      if (json && typeof json === 'object') rawBody = json;
    } catch {
      rawBody = {};
    }
    const parsedBody = bodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      obs.warn('Invalid research request body', { issues: parsedBody.error.issues.map((issue) => issue.path.join('.')) });
      return NextResponse.json({ error: 'Invalid research request', details: parsedBody.error.flatten() }, { status: 400 });
    }
    const body = parsedBody.data;

    const auth = await requireOrgRole(CAN_RUN_RESEARCH);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const brand = await loadBrand(supabase, brandId, auth.context.organizationId);
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    if (!brand.website_url) return NextResponse.json({ error: 'Brand has no website configured' }, { status: 400 });

    if (body.idempotencyKey) {
      const existing = await supabase
        .from('research_runs')
        .select('id,status')
        .eq('organization_id', auth.context.organizationId)
        .eq('idempotency_key', body.idempotencyKey)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        if (RESEARCH_ACTIVE_STATUSES.includes(existing.data.status as (typeof RESEARCH_ACTIVE_STATUSES)[number])) {
          return NextResponse.json({ error: 'A research run is already active for this request', researchRunId: existing.data.id, status: existing.data.status }, { status: 409 });
        }
        return NextResponse.json({ ok: true, researchRunId: existing.data.id, status: existing.data.status }, { status: 200 });
      }
    }

    const active = await supabase
      .from('research_runs')
      .select('id,status')
      .eq('brand_id', brand.id)
      .eq('organization_id', auth.context.organizationId)
      .in('status', [...RESEARCH_ACTIVE_STATUSES])
      .limit(1)
      .maybeSingle();
    if (active.error) throw active.error;
    if (active.data) {
      return NextResponse.json(
        { error: 'A research run is already active for this brand', researchRunId: active.data.id, status: active.data.status },
        { status: 409 },
      );
    }

    const idempotencyKey = body.idempotencyKey ?? `research:${brand.id}:${crypto.randomUUID()}`;
    const inserted = await supabase
      .from('research_runs')
      .insert({ organization_id: auth.context.organizationId, brand_id: brand.id, idempotency_key: idempotencyKey, status: 'QUEUED' })
      .select('id,status')
      .single();

    if (inserted.error) {
      if (inserted.error.code === '23505') {
        const existingByKey = await supabase
          .from('research_runs')
          .select('id,status')
          .eq('organization_id', auth.context.organizationId)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();

        if (!existingByKey.error && existingByKey.data) {
          if (RESEARCH_ACTIVE_STATUSES.includes(existingByKey.data.status as (typeof RESEARCH_ACTIVE_STATUSES)[number])) {
            return NextResponse.json({ error: 'A research run is already active for this request', researchRunId: existingByKey.data.id, status: existingByKey.data.status }, { status: 409 });
          }
          return NextResponse.json({ ok: true, researchRunId: existingByKey.data.id, status: existingByKey.data.status }, { status: 200 });
        }

        // A partial unique index can also reject a concurrent active run
        // even when each request generated a different idempotency key.
        const concurrent = await supabase
          .from('research_runs')
          .select('id,status')
          .eq('brand_id', brand.id)
          .eq('organization_id', auth.context.organizationId)
          .in('status', [...RESEARCH_ACTIVE_STATUSES])
          .limit(1)
          .maybeSingle();

        if (!concurrent.error && concurrent.data) {
          return NextResponse.json(
            { error: 'A research run is already active for this brand', researchRunId: concurrent.data.id, status: concurrent.data.status },
            { status: 409 },
          );
        }
      }
      throw inserted.error;
    }
    const runId = inserted.data.id;
    startedRun = { id: runId, organizationId: auth.context.organizationId };

    obs.info('Research run created', { researchRunId: runId, brandId: brand.id, organizationId: auth.context.organizationId, actorRole: auth.context.role });

    if (await isReplayOrganization(supabase, auth.context.organizationId)) {
      await completeReplayResearchRun(supabase, {
        organizationId: auth.context.organizationId,
        brandId: brand.id,
        researchRunId: runId,
        userId: auth.context.userId,
      });
      startedRun = null;
      return NextResponse.json({ ok: true, researchRunId: runId, status: 'COMPLETED', replay: true }, { status: 201 });
    }

    scheduleResearchExecution({
      supabase,
      organizationId: auth.context.organizationId,
      brandId: brand.id,
      websiteUrl: brand.website_url,
      researchRunId: runId,
    });

    startedRun = null;
    return NextResponse.json({ ok: true, researchRunId: runId, status: 'QUEUED' }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && isNoRowsError(error as unknown as { code?: string })) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    const message = error instanceof Error ? error.message : String(error);
    obs.error('Research request failed', { error: message });
    if (startedRun) {
      // An active run left behind makes every later attempt return 409.
      const supabase = await createSupabaseServerClient();
      await abandonRun(supabase, { researchRunId: startedRun.id, organizationId: startedRun.organizationId, errorMessage: 'Research could not be started' });
    }
    return NextResponse.json({ error: 'Could not start research' }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);

    const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const brand = await loadBrand(supabase, brandId, auth.context.organizationId);
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const { data: runs, error } = await supabase
      .from('research_runs')
      .select('id,status,pages_processed,pages_discovered,error_code,error_message,created_at,started_at,finished_at,ai_tasks(research_run_id,status,provider,model,error_message,created_at)')
      .eq('brand_id', brand.id)
      .eq('organization_id', auth.context.organizationId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;

    const mapped = (runs ?? []).map((run) => {
      const ai = Array.isArray(run.ai_tasks) && run.ai_tasks.length > 0
        ? [...run.ai_tasks].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        : null;
      return {
        id: run.id,
        status: run.status,
        pagesProcessed: run.pages_processed,
        pagesDiscovered: run.pages_discovered,
        errorCode: run.error_code,
        errorMessage: run.error_message,
        createdAt: run.created_at,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        ai: ai
          ? { status: ai.status, provider: ai.provider, model: ai.model, errorMessage: ai.error_message }
          : null,
      };
    });

    return NextResponse.json({ ok: true, runs: mapped }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    obs.error('Research status load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load research runs' }, { status: 500 });
  }
}