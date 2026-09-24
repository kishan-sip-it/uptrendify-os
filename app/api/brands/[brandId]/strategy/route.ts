import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_GENERATE_STRATEGY, CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { completeReplayStrategy, isReplayOrganization } from '@/lib/replay';
import { scheduleStrategyExecution, STRATEGY_ACTIVE_STATUSES } from '@/lib/strategy/pipeline';
import { obs } from '@/lib/obs/logger';
import { checkApprovalGate, gateMessage, loadSuggestionRows, GATE_MIN_APPROVED } from '@/lib/brain/review';

const paramsSchema = z.object({ brandId: z.string().uuid() });

const bodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9:_-]+$/).optional(),
  })
  .strict();

type ActiveStatus = (typeof STRATEGY_ACTIVE_STATUSES)[number];

function isActive(status: string): status is ActiveStatus {
  return (STRATEGY_ACTIVE_STATUSES as readonly string[]).includes(status);
}

async function loadBrand(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, brandId: string, organizationId: string) {
  const result = await supabase
    .from('brands')
    .select('id,name')
    .eq('id', brandId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as { id: string; name: string } | null;
}

function replayResponse(strategy: { id: string; status: string; version: number }) {
  return {
    strategyId: strategy.id,
    status: strategy.status,
    version: strategy.version,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const auth = await requireOrgRole(CAN_GENERATE_STRATEGY);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const brand = await loadBrand(supabase, brandId, auth.context.organizationId);
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const suggestionRows = await loadSuggestionRows(supabase, {
      organizationId: auth.context.organizationId,
      brandId,
    });
    const approvalGate = checkApprovalGate(suggestionRows);
    if (!approvalGate.ok) {
      const approved = suggestionRows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED').length;
      return NextResponse.json(
        {
          error: gateMessage(suggestionRows),
          errorCode: 'INSUFFICIENT_APPROVED_BRAIN',
          approvalGate: {
            ok: false,
            approved,
            required: GATE_MIN_APPROVED,
            missing: approvalGate.missing,
          },
        },
        { status: 409 },
      );
    }

    if (body.idempotencyKey) {
      const existing = await supabase
        .from('strategies')
        .select('id,status,version')
        .eq('organization_id', auth.context.organizationId)
        .eq('idempotency_key', body.idempotencyKey)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        if (isActive(existing.data.status)) {
          return NextResponse.json(
            { error: 'A strategy is already being generated for this request', strategyId: existing.data.id, status: existing.data.status },
            { status: 409 },
          );
        }
        return NextResponse.json({ ok: true, ...replayResponse(existing.data) }, { status: 200 });
      }
    }

    const active = await supabase
      .from('strategies')
      .select('id,status')
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .in('status', [...STRATEGY_ACTIVE_STATUSES])
      .limit(1)
      .maybeSingle();
    if (active.error) throw active.error;
    if (active.data) {
      return NextResponse.json(
        { error: 'A strategy is already being generated for this brand', strategyId: active.data.id, status: active.data.status },
        { status: 409 },
      );
    }

    const versionResult = await supabase
      .from('strategies')
      .select('version')
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionResult.error) throw versionResult.error;
    const nextVersion = (versionResult.data?.version ?? 0) + 1;

    const idempotencyKey = body.idempotencyKey ?? `strategy:${brand.id}:${crypto.randomUUID()}`;
    const insertRow = (version: number) =>
      supabase
        .from('strategies')
        .insert({
          organization_id: auth.context.organizationId,
          brand_id: brand.id,
          title: `${brand.name} — Marketing Strategy`,
          version,
          status: 'QUEUED',
          idempotency_key: idempotencyKey,
          created_by: auth.context.userId,
        })
        .select('id,status,version')
        .single();

    let inserted = await insertRow(nextVersion);
    if (inserted.error) {
      if (inserted.error.code === '23505') {
        if (body.idempotencyKey) {
          const existing = await supabase
            .from('strategies')
            .select('id,status,version')
            .eq('organization_id', auth.context.organizationId)
            .eq('idempotency_key', body.idempotencyKey)
            .maybeSingle();
          if (!existing.error && existing.data) {
            if (isActive(existing.data.status)) {
              return NextResponse.json(
                { error: 'A strategy is already being generated for this request', strategyId: existing.data.id, status: existing.data.status },
                { status: 409 },
              );
            }
            return NextResponse.json({ ok: true, ...replayResponse(existing.data) }, { status: 200 });
          }
        }

        const concurrent = await supabase
          .from('strategies')
          .select('id,status,version')
          .eq('brand_id', brand.id)
          .eq('organization_id', auth.context.organizationId)
          .in('status', [...STRATEGY_ACTIVE_STATUSES])
          .limit(1)
          .maybeSingle();

        if (!concurrent.error && concurrent.data) {
          return NextResponse.json(
            { error: 'A strategy is already being generated for this brand', strategyId: concurrent.data.id, status: concurrent.data.status },
            { status: 409 },
          );
        }

        // Otherwise the conflict came from the (brand_id, version) uniqueness
        // constraint; advance once and retry without masking unrelated errors.
        const retryVersion = await supabase
          .from('strategies')
          .select('version')
          .eq('brand_id', brand.id)
          .eq('organization_id', auth.context.organizationId)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (retryVersion.error || !retryVersion.data) throw inserted.error;
        inserted = await insertRow(retryVersion.data.version + 1);
      }
      if (inserted.error) throw inserted.error;
    }
    const strategyId = inserted.data.id;

    obs.info('Strategy generation queued', {
      strategyId,
      brandId: brand.id,
      organizationId: auth.context.organizationId,
      version: inserted.data.version,
      actorId: auth.context.userId,
    });

    if (await isReplayOrganization(supabase, auth.context.organizationId)) {
      const outcome = await completeReplayStrategy(supabase, {
        organizationId: auth.context.organizationId,
        brandId: brand.id,
        strategyId,
        userId: auth.context.userId,
        input: { version: inserted.data.version },
      });
      return NextResponse.json(
        { ok: true, strategyId, status: outcome.status, version: inserted.data.version, replay: true },
        { status: 201 },
      );
    }

    scheduleStrategyExecution({
      supabase,
      organizationId: auth.context.organizationId,
      brandId: brand.id,
      strategyId,
      createdBy: auth.context.userId,
    });

    return NextResponse.json(
      { ok: true, strategyId, status: 'QUEUED', version: inserted.data.version },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid strategy request' }, { status: 400 });
    obs.error('Strategy request failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not generate strategy' }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);

    const auth = await requireOrgRole(CAN_VIEW_BRAND);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const brand = await loadBrand(supabase, brandId, auth.context.organizationId);
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const latestResult = await supabase
      .from('strategies')
      .select('id,title,status,version,provider,model,output,input_snapshot,error_code,error_message,created_at,started_at,finished_at')
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestResult.error) throw latestResult.error;

    const versionsResult = await supabase
      .from('strategies')
      .select('id,title,status,version,provider,model,error_code,error_message,created_at,started_at,finished_at')
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .order('version', { ascending: false })
      .limit(10);
    if (versionsResult.error) throw versionsResult.error;

    const latestRow = latestResult.data;
    const latest = latestRow
      ? {
          id: latestRow.id,
          title: latestRow.title,
          status: latestRow.status,
          version: latestRow.version,
          provider: latestRow.provider,
          model: latestRow.model,
          output: latestRow.output ?? {},
          inputSnapshot: latestRow.input_snapshot ?? {},
          errorCode: latestRow.error_code,
          errorMessage: latestRow.error_message,
          createdAt: latestRow.created_at,
          startedAt: latestRow.started_at,
          finishedAt: latestRow.finished_at,
        }
      : null;

    const suggestionRows = await loadSuggestionRows(supabase, {
      organizationId: auth.context.organizationId,
      brandId,
    });
    const approvalGate = checkApprovalGate(suggestionRows);
    const approved = suggestionRows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED').length;

    const versions = (versionsResult.data ?? []).map((strategy) => ({
      id: strategy.id,
      title: strategy.title,
      status: strategy.status,
      version: strategy.version,
      provider: strategy.provider,
      model: strategy.model,
      errorCode: strategy.error_code,
      errorMessage: strategy.error_message,
      createdAt: strategy.created_at,
      startedAt: strategy.started_at,
      finishedAt: strategy.finished_at,
    }));

    return NextResponse.json(
      {
        ok: true,
        latest,
        versions,
        canGenerate: CAN_GENERATE_STRATEGY.includes(auth.context.role),
        activeStatuses: [...STRATEGY_ACTIVE_STATUSES],
        approvalGate: {
          ok: approvalGate.ok,
          approved,
          required: GATE_MIN_APPROVED,
          missing: approvalGate.missing,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    obs.error('Strategy load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load strategy' }, { status: 500 });
  }
}