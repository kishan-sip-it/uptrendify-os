import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_MANAGE_CAMPAIGNS, CAN_VIEW_CAMPAIGNS, requireOrgRole } from '@/lib/auth/roles';
import { isCampaignStatus } from '@/lib/campaign/lifecycle';
import { safeValidateCampaignCreate } from '@/lib/campaign/schema';
import { loadBrand, loadStrategy, serializeCampaign } from '@/lib/campaign/service';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid() });

export async function GET(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '30') || 30, 1), 50);
    const page = Math.max(Number(url.searchParams.get('page') ?? '1') || 1, 1);
    const statusFilter = url.searchParams.get('status')?.toUpperCase();
    const channelFilter = url.searchParams.get('channel');
    const q = url.searchParams.get('q')?.trim();
    const sort = url.searchParams.get('sort') ?? 'created_desc';
    const offset = (page - 1) * limit;

    const auth = await requireOrgRole(CAN_VIEW_CAMPAIGNS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const brand = await loadBrand(supabase, { brandId, organizationId: auth.context.organizationId });
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    let query = supabase
      .from('campaigns')
      .select(
        'id,name,objective,description,status,start_date,end_date,budget,currency,channels,strategy_id,client_id,created_at,updated_at,strategy:strategies(id,title,version,status)',
        { count: 'exact' },
      )
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId);
    if (statusFilter && isCampaignStatus(statusFilter)) query = query.eq('status', statusFilter);
    if (channelFilter) query = query.contains('channels', [channelFilter]);
    if (q) query = query.ilike('name', `%${q}%`);
    if (sort === 'created_asc') query = query.order('created_at', { ascending: true });
    else if (sort === 'updated_desc') query = query.order('updated_at', { ascending: false });
    else if (sort === 'name_asc') query = query.order('name', { ascending: true });
    else query = query.order('created_at', { ascending: false });
    query = query.range(offset, offset + limit - 1);

    const campaignsResult = await query;
    if (campaignsResult.error) throw campaignsResult.error;
    const campaigns = (campaignsResult.data ?? []) as Array<Record<string, unknown>>;

    const campaignIds = campaigns.map((campaign) => campaign.id as string);
    const contentCounts = new Map<string, number>();
    if (campaignIds.length > 0) {
      const countsResult = await supabase
        .from('content_items')
        .select('campaign_id')
        .in('campaign_id', campaignIds)
        .eq('organization_id', auth.context.organizationId);
      if (countsResult.error) throw countsResult.error;
      for (const row of countsResult.data ?? []) {
        const campaignId = row.campaign_id as string | null;
        if (campaignId) contentCounts.set(campaignId, (contentCounts.get(campaignId) ?? 0) + 1);
      }
    }

    const strategiesResult = await supabase
      .from('strategies')
      .select('id,title,version,status,created_at')
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .eq('status', 'SUCCEEDED')
      .order('version', { ascending: false })
      .limit(20);
    if (strategiesResult.error) throw strategiesResult.error;

    const normalized = campaigns.map((campaign) => ({
      ...serializeCampaign(campaign),
      contentCount: contentCounts.get(campaign.id as string) ?? 0,
    }));

    return NextResponse.json(
      {
        ok: true,
        campaigns: normalized,
        total: campaignsResult.count ?? normalized.length,
        page,
        limit,
        strategyOptions: (strategiesResult.data ?? []).map((strategy) => ({
          id: strategy.id,
          title: strategy.title,
          version: strategy.version,
          status: strategy.status,
        })),
        canManage: CAN_MANAGE_CAMPAIGNS.includes(auth.context.role),
        gate: {
          hasApprovedStrategy: (strategiesResult.data ?? []).length > 0,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    obs.error('Campaign list failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load campaigns' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);
    const parsed = safeValidateCampaignCreate(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid campaign request' }, { status: 400 });
    const body = parsed.data;

    const auth = await requireOrgRole(CAN_MANAGE_CAMPAIGNS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const brand = await loadBrand(supabase, { brandId, organizationId: auth.context.organizationId });
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const strategy = await loadStrategy(supabase, {
      strategyId: body.strategyId,
      organizationId: auth.context.organizationId,
      brandId,
    });
    if (!strategy) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    if (strategy.status !== 'SUCCEEDED') {
      return NextResponse.json({ error: 'Only approved strategies can ground a campaign' }, { status: 409 });
    }

    const insert = await supabase
      .from('campaigns')
      .insert({
        organization_id: auth.context.organizationId,
        brand_id: brand.id,
        client_id: brand.client_id,
        strategy_id: strategy.id,
        name: body.name,
        objective: body.objective ?? null,
        description: body.description ?? null,
        start_date: body.startDate ?? null,
        end_date: body.endDate ?? null,
        budget: body.budget == null ? null : Number(Math.round(body.budget * 100) / 100),
        currency: body.currency ?? 'USD',
        channels: body.channels ?? [],
        status: 'DRAFT',
        metadata: {},
        created_by: auth.context.userId,
      })
      .select('id,name,status,created_at')
      .single();
    if (insert.error) throw insert.error;

    await supabase.from('audit_logs').insert({
      organization_id: auth.context.organizationId,
      actor_user_id: auth.context.userId,
      action: 'campaign.created',
      entity_type: 'campaign',
      entity_id: insert.data.id,
      metadata: { brandId: brand.id, strategyId: strategy.id },
    });

    obs.info('Campaign created', {
      campaignId: insert.data.id,
      brandId: brand.id,
      organizationId: auth.context.organizationId,
      createdBy: auth.context.userId,
    });

    return NextResponse.json({ ok: true, campaignId: insert.data.id, item: insert.data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid campaign request' }, { status: 400 });
    obs.error('Campaign create failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not create campaign' }, { status: 500 });
  }
}