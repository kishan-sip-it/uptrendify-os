import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_PUBLISH_CONTENT, CAN_REVIEW_CONTENT, CAN_VIEW_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { CONTENT_TYPE_VALUES } from '@/lib/content/schema';
import { QUEUE_STATUSES } from '@/lib/publish/schema';
import { obs } from '@/lib/obs/logger';

const querySchema = z.object({
  brand: z.string().uuid().nullish(),
  campaign: z.string().uuid().nullish(),
  type: z.enum(CONTENT_TYPE_VALUES as [string, ...string[]]).nullish(),
  status: z.enum([...QUEUE_STATUSES] as [string, ...string[]]).nullish(),
  reviewer: z.string().uuid().nullish(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  q: z.string().trim().max(200).nullish(),
  page: z.coerce.number().int().min(1).max(10000).nullish(),
  limit: z.coerce.number().int().min(1).max(100).nullish(),
});

async function loadBrandLabels(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
) {
  const [brands, clients, campaigns] = await Promise.all([
    supabase.from('brands').select('id,name,client_id').eq('organization_id', organizationId),
    supabase.from('clients').select('id,name').eq('organization_id', organizationId),
    supabase.from('campaigns').select('id,name,brand_id').eq('organization_id', organizationId),
  ]);
  if (brands.error) throw brands.error;
  if (clients.error) throw clients.error;
  if (campaigns.error) throw campaigns.error;
  const clientNames = new Map((clients.data ?? []).map((row) => [row.id as string, row.name as string]));
  const brandLabels = new Map(
    (brands.data ?? []).map((row) => [
      row.id as string,
      { id: row.id as string, name: row.name as string, clientId: (row.client_id as string | null) ?? null, clientName: clientNames.get(row.client_id as string) ?? null },
    ]),
  );
  const campaignLabels = new Map((campaigns.data ?? []).map((row) => [row.id as string, row.name as string]));
  return { brandLabels, campaignLabels };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = querySchema.parse(Object.fromEntries(url.searchParams.entries()));

    const page = params.page ?? 1;
    const limit = params.limit ?? 30;
    const offset = (page - 1) * limit;

    const auth = await requireOrgRole(CAN_VIEW_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();

    let reviewedItemIds: string[] | null = null;
    if (params.reviewer) {
      const reviewedResult = await supabase
        .from('content_reviews')
        .select('content_item_id')
        .eq('organization_id', auth.context.organizationId)
        .eq('reviewer_id', params.reviewer)
        .limit(1000);
      if (reviewedResult.error) throw reviewedResult.error;
      reviewedItemIds = [...new Set((reviewedResult.data ?? []).map((row) => row.content_item_id as string))];
      if (reviewedItemIds.length === 0) {
        return NextResponse.json(
          { ok: true, items: [], total: 0, page, limit, canApprove: false, canPublish: false },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
    }

    let query = supabase
      .from('content_items')
      .select('id,type,title,status,channel,brand_id,campaign_id,current_version_id,created_at,updated_at', { count: 'exact' })
      .eq('organization_id', auth.context.organizationId)
      .in('status', [...QUEUE_STATUSES]);

    if (params.brand) query = query.eq('brand_id', params.brand);
    if (params.campaign) query = query.eq('campaign_id', params.campaign);
    if (params.type) query = query.eq('type', params.type);
    if (params.status) query = query.eq('status', params.status);
    if (params.dateFrom) query = query.gte('updated_at', `${params.dateFrom}T00:00:00.000Z`);
    if (params.dateTo) query = query.lte('updated_at', `${params.dateTo}T23:59:59.999Z`);
    if (params.q) query = query.ilike('title', `%${params.q}%`);
    if (reviewedItemIds) query = query.in('id', reviewedItemIds);

    query = query.order('updated_at', { ascending: false }).range(offset, offset + limit - 1);

    const itemsResult = await query;
    if (itemsResult.error) throw itemsResult.error;
    const items = (itemsResult.data ?? []) as Array<Record<string, unknown>>;

    const itemIds = items.map((item) => item.id as string);
    const versionIds = items
      .map((item) => item.current_version_id as string | null)
      .filter((id): id is string => typeof id === 'string');

    const [versionsResult, reviewsResult] = await Promise.all([
      versionIds.length > 0
        ? supabase.from('content_versions').select('id,version,headline,body,provider,model,created_at').in('id', versionIds)
        : Promise.resolve({ data: [], error: null }),
      itemIds.length > 0
        ? supabase
            .from('content_reviews')
            .select('id,decision,comment,reviewer_id,content_version_id,content_item_id,created_at')
            .eq('organization_id', auth.context.organizationId)
            .in('content_item_id', itemIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (versionsResult.error) throw versionsResult.error;
    if (reviewsResult.error) throw reviewsResult.error;

    const versionsById = new Map((versionsResult.data ?? []).map((row) => [row.id as string, row]));
    const reviewsByItem = new Map<string, Array<Record<string, unknown>>>();
    for (const review of reviewsResult.data ?? []) {
      const itemId = review.content_item_id as string;
      const bucket = reviewsByItem.get(itemId) ?? [];
      if (bucket.length < 3) bucket.push(review);
      reviewsByItem.set(itemId, bucket);
    }

    const { brandLabels, campaignLabels } = await loadBrandLabels(supabase, auth.context.organizationId);

    const normalized = items.map((item) => {
      const brand = brandLabels.get(item.brand_id as string);
      const version = versionsById.get(item.current_version_id as string);
      return {
        id: item.id,
        brandId: item.brand_id,
        brandName: brand?.name ?? null,
        clientId: brand?.clientId ?? null,
        clientName: brand?.clientName ?? null,
        campaignId: item.campaign_id ?? null,
        campaignName: (item.campaign_id && campaignLabels.get(item.campaign_id as string)) ?? null,
        type: item.type,
        title: item.title,
        status: item.status,
        channel: item.channel ?? null,
        currentVersion: version
          ? {
              id: version.id,
              version: version.version,
              headline: version.headline,
              bodyPreview: (version.body ?? '').slice(0, 280),
              provider: version.provider,
              model: version.model,
              createdAt: version.created_at,
            }
          : null,
        reviews: (reviewsByItem.get(item.id as string) ?? []).map((review) => ({
          id: review.id,
          decision: review.decision,
          comment: review.comment ?? null,
          reviewerId: review.reviewer_id,
          contentVersionId: review.content_version_id ?? null,
          createdAt: review.created_at,
        })),
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        items: normalized,
        total: itemsResult.count ?? normalized.length,
        page,
        limit,
        canApprove: CAN_REVIEW_CONTENT.includes(auth.context.role),
        canPublish: CAN_PUBLISH_CONTENT.includes(auth.context.role),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid queue filter' }, { status: 400 });
    obs.error('Approval queue failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load approval queue' }, { status: 500 });
  }
}