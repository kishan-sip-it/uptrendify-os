import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_MANAGE_CAMPAIGNS, CAN_VIEW_CAMPAIGNS, requireOrgRole } from '@/lib/auth/roles';
import { campaignUpdateSchema, normalizeCampaignStrategyIds } from '@/lib/campaign/schema';
import { loadCampaign, serializeCampaign } from '@/lib/campaign/service';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid(), campaignId: z.string().uuid() });

async function validateStrategySet(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, args: { strategyIds: string[]; organizationId: string; brandId: string }) {
  const uniqueIds = Array.from(new Set(args.strategyIds)); if (uniqueIds.length === 0) throw new Error('At least one approved strategy is required');
  const results = await Promise.all(uniqueIds.map((strategyId) => supabase.from('strategies').select('id,status').eq('id', strategyId).eq('organization_id', args.organizationId).eq('brand_id', args.brandId).maybeSingle()));
  for (const result of results) if (result.error) throw result.error;
  const strategies = results.map((result) => result.data).filter(Boolean); if (strategies.length !== uniqueIds.length) throw new Error('One or more selected strategies were not found for this brand'); if (strategies.some((strategy) => strategy!.status !== 'SUCCEEDED')) throw new Error('Only approved strategies can ground a campaign'); return uniqueIds;
}

export async function GET(request: Request, { params }: { params: Promise<{ brandId: string; campaignId: string }> }) {
  try {
    const { brandId, campaignId } = paramsSchema.parse(await params); const auth = await requireOrgRole(CAN_VIEW_CAMPAIGNS); if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status }); const supabase = await createSupabaseServerClient();
    const campaign = await loadCampaign(supabase, { campaignId, brandId, organizationId: auth.context.organizationId }); if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    const contentResult = await supabase.from('content_items').select('id,type,title,status,channel,created_at,updated_at').eq('campaign_id', campaignId).eq('brand_id', brandId).eq('organization_id', auth.context.organizationId).order('created_at', { ascending: false }).limit(50); if (contentResult.error) throw contentResult.error;
    const serialized = serializeCampaign(campaign); let strategyOptions = serialized.strategies.map((strategy) => ({ id: strategy.id, title: strategy.title, version: strategy.version, status: strategy.status }));
    if (new URL(request.url).searchParams.get('includeStrategyOptions') === 'true') {
      const options = await supabase.from('strategies').select('id,title,version,status').eq('brand_id', brandId).eq('organization_id', auth.context.organizationId).eq('status', 'SUCCEEDED').order('version', { ascending: false }).limit(20); if (options.error) throw options.error; strategyOptions = options.data ?? [];
    }
    return NextResponse.json({ ok: true, campaign: serialized, content: (contentResult.data ?? []).map((item) => ({ id: item.id, type: item.type, title: item.title, status: item.status, channel: item.channel ?? null, createdAt: item.created_at, updatedAt: item.updated_at })), strategyOptions, canManage: CAN_MANAGE_CAMPAIGNS.includes(auth.context.role) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 }); obs.error('Campaign detail failed', { error: error instanceof Error ? error.message : String(error) }); return NextResponse.json({ error: 'Could not load campaign' }, { status: 500 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ brandId: string; campaignId: string }> }) {
  try {
    const { brandId, campaignId } = paramsSchema.parse(await params); const body = campaignUpdateSchema.parse(await request.json().catch(() => ({}))); const auth = await requireOrgRole(CAN_MANAGE_CAMPAIGNS); if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status }); const supabase = await createSupabaseServerClient();
    const campaign = await loadCampaign(supabase, { campaignId, brandId, organizationId: auth.context.organizationId }); if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 }); if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    if (body.startDate !== undefined || body.endDate !== undefined) { const mergedStart = body.startDate === undefined ? (campaign.start_date as string | null) : body.startDate; const mergedEnd = body.endDate === undefined ? (campaign.end_date as string | null) : body.endDate; if (mergedStart != null && mergedEnd != null && mergedEnd < mergedStart) return NextResponse.json({ error: 'End date must be on or after the start date' }, { status: 400 }); }
    const hasStrategySetUpdate = body.strategyIds !== undefined || body.strategyId !== undefined; let strategyIds: string[] | null = null;
    if (hasStrategySetUpdate) { const current = serializeCampaign(campaign).strategies; const requested = body.strategyIds !== undefined ? normalizeCampaignStrategyIds(body) : normalizeCampaignStrategyIds({ strategyIds: [body.strategyId as string, ...current.filter((strategy) => !strategy.isPrimary).map((strategy) => strategy.id)] }); strategyIds = await validateStrategySet(supabase, { strategyIds: requested, organizationId: auth.context.organizationId, brandId }); }
    const campaignRow: Record<string, unknown> = { updated_at: new Date().toISOString() }; if (body.name !== undefined) campaignRow.name = body.name; if (body.objective !== undefined) campaignRow.objective = body.objective; if (body.description !== undefined) campaignRow.description = body.description; if (strategyIds) campaignRow.strategy_id = strategyIds[0]; if (body.startDate !== undefined) campaignRow.start_date = body.startDate; if (body.endDate !== undefined) campaignRow.end_date = body.endDate; if (body.budget !== undefined) campaignRow.budget = body.budget == null ? null : Number(Math.round(body.budget * 100) / 100); if (body.currency !== undefined) campaignRow.currency = body.currency; if (body.channels !== undefined) campaignRow.channels = body.channels;
    const update = await supabase.from('campaigns').update(campaignRow).eq('id', campaignId).eq('organization_id', auth.context.organizationId); if (update.error) throw update.error;
    if (strategyIds) { const links = strategyIds.map((strategyId, index) => ({ organization_id: auth.context.organizationId, campaign_id: campaignId, strategy_id: strategyId, is_primary: index === 0, sort_order: index, created_by: auth.context.userId })); const upsert = await supabase.from('campaign_strategies').upsert(links, { onConflict: 'campaign_id,strategy_id' }); if (upsert.error) throw upsert.error; const remove = await supabase.from('campaign_strategies').delete().eq('campaign_id', campaignId).eq('organization_id', auth.context.organizationId).not('strategy_id', 'in', `(${strategyIds.join(',')})`); if (remove.error) throw remove.error; }
    await supabase.from('audit_logs').insert({ organization_id: auth.context.organizationId, actor_user_id: auth.context.userId, action: 'campaign.updated', entity_type: 'campaign', entity_id: campaignId, metadata: { brandId, updatedFields: Object.keys(body), ...(strategyIds ? { strategyIds } : {}) } });
    const refreshed = await loadCampaign(supabase, { campaignId, brandId, organizationId: auth.context.organizationId }); return NextResponse.json({ ok: true, campaign: refreshed ? serializeCampaign(refreshed) : null });
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid campaign update', details: error.flatten() }, { status: 400 }); const message = error instanceof Error ? error.message : String(error); obs.error('Campaign update failed', { error: message }); if (message.includes('Only approved strategies') || message.includes('selected strategies') || message.includes('At least one approved strategy')) return NextResponse.json({ error: message }, { status: 409 }); return NextResponse.json({ error: 'Could not update campaign' }, { status: 500 }); }
}