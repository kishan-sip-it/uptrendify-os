import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_GENERATE_CONTENT, CAN_REVIEW_CONTENT, CAN_VIEW_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { contentItemInputSchema } from '@/lib/content/schema';
import { CONTENT_BODY_MAX } from '@/lib/content/schema';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid(), contentId: z.string().uuid() });

const updateSchema = contentItemInputSchema.partial().extend({
  body: z.string().trim().max(CONTENT_BODY_MAX).optional(),
  clientId: z.string().uuid().nullish(),
});

async function loadItem(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  args: { brandId: string; contentId: string; organizationId: string },
) {
  const result = await supabase
    .from('content_items')
    .select('id,type,title,status,channel,topic,objective,audience,tone,cta,instructions,context,client_id,current_version_id,strategy_id,created_by,created_at,updated_at')
    .eq('id', args.contentId)
    .eq('brand_id', args.brandId)
    .eq('organization_id', args.organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as Record<string, unknown> | null;
}

function normalizeItem(item: Record<string, unknown>) {
  const context = (item.context ?? {}) as { campaignContext?: string | null };
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    status: item.status,
    channel: item.channel ?? null,
    topic: item.topic ?? null,
    objective: item.objective ?? null,
    audience: item.audience ?? null,
    tone: item.tone ?? null,
    cta: item.cta ?? null,
    instructions: item.instructions ?? null,
    campaignContext: context.campaignContext ?? null,
    clientId: item.client_id ?? null,
    strategyId: item.strategy_id ?? null,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    currentVersionId: item.current_version_id ?? null,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  try {
    const { brandId, contentId } = paramsSchema.parse(await params);

    const auth = await requireOrgRole(CAN_VIEW_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const item = await loadItem(supabase, { brandId, contentId, organizationId: auth.context.organizationId });
    if (!item) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

    const versionsResult = await supabase
      .from('content_versions')
      .select('id,version,headline,body,cta,rationale,provider,model,author_user_id,strategy_id,brand_fact_references,strategy_references,metadata,created_at')
      .eq('content_item_id', contentId)
      .eq('organization_id', auth.context.organizationId)
      .order('version', { ascending: false })
      .limit(40);
    if (versionsResult.error) throw versionsResult.error;

    const reviewsResult = await supabase
      .from('content_reviews')
      .select('id,decision,comment,reviewer_id,content_version_id,created_at')
      .eq('content_item_id', contentId)
      .eq('organization_id', auth.context.organizationId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (reviewsResult.error) throw reviewsResult.error;

    const versions = (versionsResult.data ?? []).map((version) => ({
      id: version.id,
      version: version.version,
      headline: version.headline,
      body: version.body,
      cta: version.cta,
      rationale: version.rationale,
      provider: version.provider,
      model: version.model,
      authorUserId: version.author_user_id,
      strategyId: version.strategy_id,
      brandFactReferences: version.brand_fact_references ?? [],
      strategyReferences: version.strategy_references ?? [],
      metadata: version.metadata ?? {},
      createdAt: version.created_at,
    }));

    const reviews = (reviewsResult.data ?? []).map((review) => ({
      id: review.id,
      decision: review.decision,
      comment: review.comment,
      reviewerId: review.reviewer_id,
      contentVersionId: review.content_version_id,
      createdAt: review.created_at,
    }));

    return NextResponse.json(
      {
        ok: true,
        item: normalizeItem(item),
        versions,
        reviews,
        canGenerate: CAN_GENERATE_CONTENT.includes(auth.context.role),
        canReview: CAN_REVIEW_CONTENT.includes(auth.context.role),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid content id' }, { status: 400 });
    obs.error('Content detail failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load content' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  try {
    const { brandId, contentId } = paramsSchema.parse(await params);
    const body = updateSchema.parse(await request.json().catch(() => ({})));

    const auth = await requireOrgRole(CAN_GENERATE_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const item = await loadItem(supabase, { brandId, contentId, organizationId: auth.context.organizationId });
    if (!item) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    if (body.clientId) {
      const client = await supabase
        .from('clients')
        .select('id')
        .eq('id', body.clientId)
        .eq('organization_id', auth.context.organizationId)
        .maybeSingle();
      if (client.error) throw client.error;
      if (!client.data) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const itemRow: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.title !== undefined) itemRow.title = body.title;
    if (body.type !== undefined) itemRow.type = body.type;
    if (body.channel !== undefined) itemRow.channel = body.channel;
    if (body.objective !== undefined) itemRow.objective = body.objective;
    if (body.audience !== undefined) itemRow.audience = body.audience;
    if (body.tone !== undefined) itemRow.tone = body.tone;
    if (body.cta !== undefined) itemRow.cta = body.cta;
    if (body.instructions !== undefined) itemRow.instructions = body.instructions;
    if (body.clientId !== undefined) itemRow.client_id = body.clientId;

    const itemUpdate = await supabase.from('content_items').update(itemRow).eq('id', contentId).eq('organization_id', auth.context.organizationId);
    if (itemUpdate.error) throw itemUpdate.error;

    let manualVersionId: string | null = null;
    if (body.body !== undefined) {
      const currentId = item.current_version_id as string | null;
      const currentResult = currentId
        ? await supabase
            .from('content_versions')
            .select('id,version,headline,body,cta,rationale,brand_fact_references,strategy_references,metadata')
            .eq('id', currentId)
            .eq('organization_id', auth.context.organizationId)
            .maybeSingle()
        : { data: null, error: null };
      if (currentResult.error) throw currentResult.error;

      const nextVersionResult = await supabase
        .from('content_versions')
        .select('version')
        .eq('content_item_id', contentId)
        .eq('organization_id', auth.context.organizationId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (nextVersionResult.error) throw nextVersionResult.error;
      const nextVersion = ((nextVersionResult.data?.version as number | undefined) ?? 0) + 1;

      const previous = currentResult.data as Record<string, unknown> | null;
      const bodyChanged = !previous || (previous.body as string) !== body.body;
      if (bodyChanged) {
        const previousMetadata = (previous?.metadata ?? {}) as Record<string, unknown>;
        const insert = await supabase
          .from('content_versions')
          .insert({
            organization_id: auth.context.organizationId,
            content_item_id: contentId,
            version: nextVersion,
            body: body.body,
            headline: (body.title ?? previous?.headline ?? item.title) as string,
            cta: (previous?.cta as string | null) ?? null,
            strategy_id: item.strategy_id as string | null,
            provider: null,
            model: null,
            author_user_id: auth.context.userId,
            rationale: (previous?.rationale as string | null) ?? null,
            brand_fact_references: (previous?.brand_fact_references ?? []) as unknown[],
            strategy_references: (previous?.strategy_references ?? []) as unknown[],
            metadata: { ...previousMetadata, manualEdit: true },
          })
          .select('id')
          .single();
        if (insert.error) throw insert.error;
        manualVersionId = insert.data.id;
      }
    }

    if (manualVersionId) {
      const versionUpdate = await supabase
        .from('content_items')
        .update({ current_version_id: manualVersionId, updated_at: new Date().toISOString() })
        .eq('id', contentId)
        .eq('organization_id', auth.context.organizationId);
      if (versionUpdate.error) throw versionUpdate.error;
    }

    await supabase.from('audit_logs').insert({
      organization_id: auth.context.organizationId,
      actor_user_id: auth.context.userId,
      action: 'content.updated',
      entity_type: 'content',
      entity_id: contentId,
      metadata: {
        updatedFields: Object.keys(body).filter((key) => key !== 'body'),
        manualEdit: Boolean(manualVersionId),
      },
    });

    const refreshed = await loadItem(supabase, { brandId, contentId, organizationId: auth.context.organizationId });
    return NextResponse.json({ ok: true, item: refreshed ? normalizeItem(refreshed) : null });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid content update' }, { status: 400 });
    obs.error('Content update failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not update content item' }, { status: 500 });
  }
}