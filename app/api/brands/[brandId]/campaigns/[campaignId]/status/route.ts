import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_MANAGE_CAMPAIGNS, requireOrgRole } from '@/lib/auth/roles';
import {
  CAMPAIGN_ACTION_TRANSITIONS,
  allowedActionsFor,
  canTransition,
  campaignStatusActionSchema,
} from '@/lib/campaign/lifecycle';
import { type CampaignStatus } from '@/lib/campaign/schema';
import { loadCampaign, serializeCampaign } from '@/lib/campaign/service';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid(), campaignId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string; campaignId: string }> }) {
  try {
    const { brandId, campaignId } = paramsSchema.parse(await params);
    const body = campaignStatusActionSchema.parse(await request.json().catch(() => ({})));

    const auth = await requireOrgRole(CAN_MANAGE_CAMPAIGNS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const campaign = await loadCampaign(supabase, { campaignId, brandId, organizationId: auth.context.organizationId });
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const current = campaign.status as CampaignStatus;
    if (!canTransition(current, body.action)) {
      const allowed = allowedActionsFor(current);
      const labels = allowed.length > 0 ? allowed.join(', ') : 'none';
      return NextResponse.json(
        { error: `Cannot ${body.action} a ${current} campaign`, allowedActions: labels },
        { status: 409 },
      );
    }

    const target = CAMPAIGN_ACTION_TRANSITIONS[body.action].to;
    const result = await supabase
      .from('campaigns')
      .update({ status: target, updated_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('organization_id', auth.context.organizationId)
      .eq('status', current)
      .select('id,status')
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      return NextResponse.json({ error: 'Campaign changed since it was loaded. Reload and try again.' }, { status: 409 });
    }

    await supabase.from('audit_logs').insert({
      organization_id: auth.context.organizationId,
      actor_user_id: auth.context.userId,
      action: 'campaign.status',
      entity_type: 'campaign',
      entity_id: campaignId,
      metadata: { brandId, from: current, to: target, action: body.action },
    });

    const refreshed = await loadCampaign(supabase, { campaignId, brandId, organizationId: auth.context.organizationId });
    return NextResponse.json({ ok: true, campaign: refreshed ? serializeCampaign(refreshed) : null });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid campaign status action' }, { status: 400 });
    obs.error('Campaign status action failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not update campaign status' }, { status: 500 });
  }
}