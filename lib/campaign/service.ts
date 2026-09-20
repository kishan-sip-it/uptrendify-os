import { createSupabaseServerClient } from '@/lib/supabase/server';

export type CampaignClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type BrandContext = {
  id: string;
  name: string;
  client_id: string | null;
};

export async function loadBrand(
  supabase: CampaignClient,
  args: { brandId: string; organizationId: string },
): Promise<BrandContext | null> {
  const result = await supabase
    .from('brands')
    .select('id,name,client_id')
    .eq('id', args.brandId)
    .eq('organization_id', args.organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as BrandContext | null;
}

export async function loadStrategy(
  supabase: CampaignClient,
  args: { strategyId: string; organizationId: string; brandId: string },
) {
  const result = await supabase
    .from('strategies')
    .select('id,title,version,status,output')
    .eq('id', args.strategyId)
    .eq('organization_id', args.organizationId)
    .eq('brand_id', args.brandId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as { id: string; title: string; version: number; status: string; output: unknown } | null;
}

export async function loadCampaign(
  supabase: CampaignClient,
  args: { campaignId: string; brandId: string; organizationId: string },
) {
  const result = await supabase
    .from('campaigns')
    .select(
      'id,name,objective,description,status,start_date,end_date,budget,currency,channels,strategy_id,client_id,created_by,created_at,updated_at,strategy:strategies(id,title,version,status,output)',
    )
    .eq('id', args.campaignId)
    .eq('brand_id', args.brandId)
    .eq('organization_id', args.organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as Record<string, unknown> | null;
}

export function serializeCampaign(campaign: Record<string, unknown>) {
  const strategy = campaign.strategy as Record<string, unknown> | null | undefined;
  const strategyOutput = (strategy?.output ?? null) as Record<string, unknown> | null;
  return {
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective ?? null,
    description: campaign.description ?? null,
    status: campaign.status,
    startDate: campaign.start_date ?? null,
    endDate: campaign.end_date ?? null,
    budget: campaign.budget ?? null,
    currency: campaign.currency ?? 'USD',
    channels: campaign.channels ?? [],
    clientId: campaign.client_id ?? null,
    strategyId: campaign.strategy_id ?? null,
    strategy: strategy
      ? {
          id: strategy.id,
          title: strategy.title,
          version: strategy.version,
          status: strategy.status,
          outputSummary: summarizeStrategyOutput(strategyOutput),
        }
      : null,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
  };
}

export function summarizeStrategyOutput(output: Record<string, unknown> | null) {
  if (!output) return null;
  const objectives = output.objectives;
  const channelItems = output.channels;
  const kpis = output.kpis;
  return {
    objectives: Array.isArray(objectives)
      ? objectives
          .map((objective) => (objective as { objective?: unknown }).objective ?? null)
          .filter((value): value is string => typeof value === 'string')
      : [],
    channelCount: Array.isArray(channelItems) ? channelItems.length : 0,
    hasKPIs: Boolean(kpis && typeof kpis === 'object' && Object.keys(kpis as Record<string, unknown>).length > 0),
  };
}