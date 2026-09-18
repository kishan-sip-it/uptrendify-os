import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_GENERATE_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { loadContentSnapshot, evaluateContentGate } from '@/lib/content/context';
import { scheduleContentExecution, CONTENT_TASK_TYPE } from '@/lib/content/pipeline';
import { completeReplayContentGeneration, isReplayOrganization } from '@/lib/replay';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid(), contentId: z.string().uuid() });

const bodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9:_-]+$/).optional(),
  })
  .strict();

async function loadBrand(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  brandId: string,
  organizationId: string,
) {
  const result = await supabase
    .from('brands')
    .select('id,name,client_id')
    .eq('id', brandId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as { id: string; name: string; client_id: string | null } | null;
}

async function loadItem(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  args: { brandId: string; contentId: string; organizationId: string },
) {
  const result = await supabase
    .from('content_items')
    .select('id,type,title,status,channel,objective,audience,tone,cta,instructions,context')
    .eq('id', args.contentId)
    .eq('brand_id', args.brandId)
    .eq('organization_id', args.organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as Record<string, unknown> | null;
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  try {
    const { brandId, contentId } = paramsSchema.parse(await params);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const auth = await requireOrgRole(CAN_GENERATE_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const brand = await loadBrand(supabase, brandId, auth.context.organizationId);
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const item = await loadItem(supabase, { brandId, contentId, organizationId: auth.context.organizationId });
    if (!item) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

    const snapshot = await loadContentSnapshot(supabase, { organizationId: auth.context.organizationId, brandId });
    const gate = evaluateContentGate(snapshot);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message, gate: { ok: false, code: gate.code, counts: gate.counts, strategyReady: gate.strategy.ready } },
        { status: 422 },
      );
    }

    const running = await supabase
      .from('ai_tasks')
      .select('id,status')
      .eq('content_item_id', contentId)
      .eq('organization_id', auth.context.organizationId)
      .eq('task_type', CONTENT_TASK_TYPE)
      .eq('status', 'RUNNING')
      .limit(1)
      .maybeSingle();
    if (running.error) throw running.error;
    if (running.data) {
      return NextResponse.json(
        { error: 'A generation is already running for this content item', aiTaskId: running.data.id, status: 'RUNNING' },
        { status: 409 },
      );
    }

    if (body.idempotencyKey) {
      const prior = await supabase
        .from('ai_tasks')
        .select('id,status,output_metadata,error_code,error_message,provider,model')
        .eq('organization_id', auth.context.organizationId)
        .eq('idempotency_key', body.idempotencyKey)
        .eq('task_type', CONTENT_TASK_TYPE)
        .maybeSingle();
      if (prior.error) throw prior.error;
      if (prior.data) {
        if (prior.data.status === 'RUNNING') {
          return NextResponse.json(
            { error: 'A generation is already running for this request', aiTaskId: prior.data.id, status: 'RUNNING' },
            { status: 409 },
          );
        }
        const metadata = (prior.data.output_metadata ?? {}) as { version?: number };
        if (prior.data.status === 'SUCCEEDED') {
          return NextResponse.json(
            { ok: true, version: metadata.version ?? null, status: 'SUCCEEDED', provider: prior.data.provider, model: prior.data.model, replay: true },
            { status: 200 },
          );
        }
        return NextResponse.json(
          { error: prior.data.error_message ?? 'A previous generation failed', status: 'FAILED', errorCode: prior.data.error_code },
          { status: 409 },
        );
      }
    }

    const context = (item.context ?? {}) as { campaignContext?: string | null };
    const intent = {
      type: item.type as string,
      channel: item.channel as string,
      title: item.title as string,
      objective: (item.objective as string | null) ?? null,
      audience: (item.audience as string | null) ?? null,
      context: context.campaignContext ?? null,
      tone: (item.tone as string | null) ?? null,
      cta: (item.cta as string | null) ?? null,
      instructions: (item.instructions as string | null) ?? null,
    };

    obs.info('Content generation requested', {
      contentId,
      brandId: brand.id,
      organizationId: auth.context.organizationId,
      contentType: intent.type,
      channel: intent.channel,
      actorId: auth.context.userId,
    });

    if (await isReplayOrganization(supabase, auth.context.organizationId)) {
      const outcome = await completeReplayContentGeneration(supabase, {
        organizationId: auth.context.organizationId,
        brandId: brand.id,
        contentId,
        userId: auth.context.userId,
        intent,
      });
      return NextResponse.json(
        { ok: true, status: outcome.status, version: outcome.version, replay: true },
        { status: 201 },
      );
    }

    scheduleContentExecution({
      supabase,
      organizationId: auth.context.organizationId,
      brandId: brand.id,
      contentId,
      intent,
      createdBy: auth.context.userId,
    });

    return NextResponse.json({ ok: true, status: 'RUNNING' }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid generate request' }, { status: 400 });
    obs.error('Content generation request failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not generate content' }, { status: 500 });
  }
}