import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_GENERATE_CONTENT, CAN_REVIEW_CONTENT, CAN_VIEW_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import {
  CONTENT_CHANNEL_VALUES,
  CONTENT_TYPE_VALUES,
  contentItemInputSchema,
  type ContentType,
  type ContentChannel,
} from '@/lib/content/schema';
import { loadContentSnapshot, evaluateContentGate } from '@/lib/content/context';
import { obs } from '@/lib/obs/logger';

const CONTENT_TYPE_SET = new Set(CONTENT_TYPE_VALUES);
const CONTENT_CHANNEL_SET = new Set(CONTENT_CHANNEL_VALUES);

function isContentType(value: string): value is ContentType {
  return CONTENT_TYPE_SET.has(value);
}

function isContentChannel(value: string): value is ContentChannel {
  return CONTENT_CHANNEL_SET.has(value);
}

const paramsSchema = z.object({ brandId: z.string().uuid() });

const createSchema = contentItemInputSchema
  .extend({ clientId: z.string().uuid().nullish(), campaignId: z.string().uuid().nullish() })
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
  return result.data as { id: string; name: string; client_id?: string | null } | null;
}

export async function GET(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '30') || 30, 1), 50);
    const page = Math.max(Number(url.searchParams.get('page') ?? '1') || 1, 1);
    const typeFilter = url.searchParams.get('type');
    const channelFilter = url.searchParams.get('channel');
    const statusFilter = url.searchParams.get('status')?.toUpperCase();
    const q = url.searchParams.get('q')?.trim();
    const sort = url.searchParams.get('sort') ?? 'created_desc';
    const offset = (page - 1) * limit;

    const auth = await requireOrgRole(CAN_VIEW_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const brand = await loadBrand(supabase, brandId, auth.context.organizationId);
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    let query = supabase
      .from('content_items')
      .select('id,type,title,status,channel,topic,objective,client_id,current_version_id,created_at,updated_at', { count: 'exact' })
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId);
    if (typeFilter && isContentType(typeFilter)) query = query.eq('type', typeFilter);
    if (channelFilter && isContentChannel(channelFilter)) query = query.eq('channel', channelFilter);
    if (statusFilter) query = query.eq('status', statusFilter);
    if (q) query = query.ilike('title', `%${q}%`);
    if (sort === 'created_asc') query = query.order('created_at', { ascending: true });
    else if (sort === 'updated_desc') query = query.order('updated_at', { ascending: false });
    else if (sort === 'title_asc') query = query.order('title', { ascending: true });
    else query = query.order('created_at', { ascending: false });
    query = query.range(offset, offset + limit - 1);

    const itemsResult = await query;
    if (itemsResult.error) throw itemsResult.error;
    const items = (itemsResult.data ?? []) as Array<Record<string, unknown>>;

    const currentVersionIds = items.map((item) => item.current_version_id).filter((id): id is string => typeof id === 'string');
    const versionsById: Record<string, Record<string, unknown>> = {};
    let versionCounts = new Map<string, number>();
    if (currentVersionIds.length > 0) {
      const versionsResult = await supabase
        .from('content_versions')
        .select('id,content_item_id,version,headline,body,provider,model,created_at')
        .in('id', currentVersionIds);
      if (versionsResult.error) throw versionsResult.error;
      for (const version of versionsResult.data ?? []) {
        versionsById[version.id] = {
          version: version.version,
          headline: version.headline,
          bodyPreview: (version.body ?? '').slice(0, 280),
          provider: version.provider,
          model: version.model,
          createdAt: version.created_at,
        };
      }
      const countsResult = await supabase
        .from('content_versions')
        .select('content_item_id')
        .in('content_item_id', items.map((item) => item.id as string));
      if (countsResult.error) throw countsResult.error;
      const counts = new Map<string, number>();
      for (const row of countsResult.data ?? []) {
        counts.set(row.content_item_id, (counts.get(row.content_item_id) ?? 0) + 1);
      }
      versionCounts = counts;
    }

    const snapshot = await loadContentSnapshot(supabase, { organizationId: auth.context.organizationId, brandId });
    const gate = evaluateContentGate(snapshot);

    const normalized = items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      status: item.status,
      channel: item.channel ?? null,
      topic: item.topic ?? null,
      clientId: item.client_id ?? null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      currentVersion: versionsById[item.current_version_id as string] ?? null,
      versionCount: versionCounts.get(item.id as string) ?? 0,
    }));

    return NextResponse.json(
      {
        ok: true,
        items: normalized,
        total: itemsResult.count ?? normalized.length,
        page,
        limit,
        gate: {
          ok: gate.ok,
          code: gate.code,
          message: gate.message,
          counts: gate.counts,
          strategyReady: gate.strategy.ready,
        },
        canGenerate: CAN_GENERATE_CONTENT.includes(auth.context.role),
        canReview: CAN_REVIEW_CONTENT.includes(auth.context.role),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    obs.error('Content list failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load content' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);
    const body = createSchema.parse(await request.json().catch(() => ({})));

    const auth = await requireOrgRole(CAN_GENERATE_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const brand = await loadBrand(supabase, brandId, auth.context.organizationId);
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    if (body.clientId && body.clientId !== brand.client_id) {
      return NextResponse.json({ error: 'Client does not own this brand' }, { status: 409 });
    }

    const effectiveClientId = brand.client_id ?? null;

    let campaignId: string | null = null;
    if (body.campaignId) {
      const campaign = await supabase
        .from('campaigns')
        .select('id')
        .eq('id', body.campaignId)
        .eq('brand_id', brandId)
        .eq('organization_id', auth.context.organizationId)
        .maybeSingle();
      if (campaign.error) throw campaign.error;
      if (!campaign.data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      campaignId = body.campaignId;
    }

    const insert = await supabase
      .from('content_items')
      .insert({
        organization_id: auth.context.organizationId,
        brand_id: brand.id,
        client_id: effectiveClientId,
        campaign_id: campaignId,
        type: body.type,
        channel: body.channel,
        title: body.title,
        topic: body.title,
        objective: body.objective ?? null,
        audience: body.audience ?? null,
        tone: body.tone ?? null,
        cta: body.cta ?? null,
        instructions: body.instructions ?? null,
        context: { campaignContext: body.context ?? null },
        status: 'DRAFT',
        created_by: auth.context.userId,
      })
      .select('id,type,title,status,channel,created_at')
      .single();
    if (insert.error) throw insert.error;

    obs.info('Content item created', {
      contentId: insert.data.id,
      brandId: brand.id,
      organizationId: auth.context.organizationId,
      contentType: body.type,
      createdBy: auth.context.userId,
    });

    return NextResponse.json({ ok: true, contentId: insert.data.id, item: insert.data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid content request' }, { status: 400 });
    obs.error('Content create failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not create content item' }, { status: 500 });
  }
}