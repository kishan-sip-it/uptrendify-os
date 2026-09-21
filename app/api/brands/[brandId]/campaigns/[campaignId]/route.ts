import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_MANAGE_CAMPAIGNS, CAN_VIEW_CAMPAIGNS, requireOrgRole } from '@/lib/auth/roles';
import { campaignUpdateSchema } from '@/lib/campaign/schema';
import { loadBrand, loadCampaign, loadStrategy, serializeCampaign } from '@/lib/campaign/service';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid(), campaignId: z.string().uuid() });

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string; campaignId: string }> }) {
  try {
    const { brandId, campaignId } = paramsSchema.parse(await params);

    const auth = await requireOrgRole(CAN_VIEW_CAMPAIGNS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const campaign = await loadCampaign(supabase, { campaignId, brandId, organizationId: auth.context.organizationId });
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const contentResult = await supabase
      .from('content_items')
      .select('id,type,title,status,channel,created_at,updated_at')
      .eq('campaign_id', campaignId)
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (contentResult.error) throw contentResult.error;

    return NextResponse.json(
      {
        ok: true,
        campaign: serializeCampaign(campaign),
        content: (contentResult.data ?? []).map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          status: item.status,
          channel: item.channel ?? null,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        })),
        canManage: CAN_MANAGE_CAMPAIGNS.includes(auth.context.role),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 });
    obs.error('Campaign detail failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load campaign' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ brandId: string; campaignId: string }> }) {
  try {
    const { brandId, campaignId } = paramsSchema.parse(await params);
    const body = campaignUpdateSchema.parse(await request.json().catch(() => ({})));

    const auth = await requireOrgRole(CAN_MANAGE_CAMPAIGNS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const campaign = await loadCampaign(supabase, { campaignId, brandId, organizationId: auth.context.organizationId });
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    if (body.startDate !== undefined || body.endDate !== undefined) {
      const mergedStart = body.startDate === undefined ? (campaign.start_date as string | null) : body.startDate;
      const mergedEnd = body.endDate === undefined ? (campaign.end_date as string | null) : body.endDate;
      if (mergedStart != null && mergedEnd != null && mergedEnd < mergedStart) {
        return NextResponse.json({ error: 'End date must be on or after the start date' }, { status: 400 });
      }
    }

    if (body.strategyId !== undefined) {
      const strategy = await loadStrategy(supabase, {
        strategyId: body.strategyId,
        organizationId: auth.context.organizationId,
        brandId,
      });
      if (!strategy) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
      if (strategy.status !== 'SUCCEEDED') {
        return NextResponse.json({ error: 'Only approved strategies can ground a campaign' }, { status: 409 });
      }
    }

    const campaignRow: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) campaignRow.name = body.name;
    if (body.objective !== undefined) campaignRow.objective = body.objective;
    if (body.description !== undefined) campaignRow.description = body.description;
    if (body.strategyId !== undefined) campaignRow.strategy_id = body.strategyId;
    if (body.startDate !== undefined) campaignRow.start_date = body.startDate;
    if (body.endDate !== undefined) campaignRow.end_date = body.endDate;
    if (body.budget !== undefined) {
      campaignRow.budget = body.budget == null ? null : Number(Math.round(body.budget * 100) / 100);
    }
    if (body.currency !== undefined) campaignRow.currency = body.currency;
    if (body.channels !== undefined) campaignRow.channels = body.channels;

    const update = await supabase
      .from('campaigns')
      .update(campaignRow)
      .eq('id', campaignId)
      .eq('organization_id', auth.context.organizationId);
    if (update.error) throw update.error;

    await supabase.from('audit_logs').insert({
      organization_id: auth.context.organizationId,
      actor_user_id: auth.context.userId,
      action: 'campaign.updated',
      entity_type: 'campaign',
      entity_id: campaignId,
      metadata: {
        brandId,
        updatedFields: Object.keys(body),
      },
    });

    const refreshed = await loadCampaign(supabase, { campaignId, brandId, organizationId: auth.context.organizationId });
    return NextResponse.json({ ok: true, campaign: refreshed ? serializeCampaign(refreshed) : null });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid campaign update' }, { status: 400 });
    obs.error('Campaign update failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not update campaign' }, { status: 500 });
  }
}