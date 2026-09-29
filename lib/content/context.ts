import type { SupabaseClient } from '@supabase/supabase-js';
import { checkApprovalGate, loadSuggestionRows, type SuggestionRow } from '@/lib/brain/review';
import { gateMessage as strategyGateMessage } from '@/lib/strategy/pipeline';
import type { BrainSnapshot, StrategyBrandMeta, StrategyEvidenceClaim, StrategyFact, StrategyInsight, StrategySource } from '@/lib/strategy/context';
import type { StrategyOutput } from '@/lib/strategy/schema';

export type ContentBrandMeta = StrategyBrandMeta & { clientId?: string | null };
export type ApprovedStrategyRef = { id: string; version: number; title: string; output: StrategyOutput; provider: string | null; model: string | null };

export type ContentSnapshot = {
  brand: ContentBrandMeta;
  facts: StrategyFact[];
  insights: StrategyInsight[];
  evidenceClaims: StrategyEvidenceClaim[];
  sources: StrategySource[];
  suggestionRows: SuggestionRow[];
  researchRunId: string | null;
  strategy: ApprovedStrategyRef | null;
  strategies?: ApprovedStrategyRef[];
};

export type ContentGate = {
  ok: boolean;
  code: 'INSUFFICIENT_BRAIN' | 'INSUFFICIENT_APPROVED_BRAIN' | 'INSUFFICIENT_STRATEGY' | null;
  message: string;
  counts: { suggestions: number; approved: number; missing: string[] };
  strategy: { ready: boolean; version: number | null; count: number };
};

function normalizeStrategy(row: Record<string, unknown>): ApprovedStrategyRef | null {
  const output = row.output as StrategyOutput | null;
  if (!row.id || !output || Object.keys(output).length === 0) return null;
  return { id: String(row.id), version: Number(row.version), title: String(row.title), output, provider: (row.provider as string | null) ?? null, model: (row.model as string | null) ?? null };
}

export async function loadContentSnapshot(supabase: SupabaseClient, args: { organizationId: string; brandId: string; campaignId?: string | null }): Promise<ContentSnapshot> {
  const { organizationId, brandId, campaignId } = args;
  const brandResult = await supabase.from('brands').select('name,website_url,industry,market_country,target_audience,primary_color,secondary_colors,brand_rules,audience_details,offer_details,positioning,messaging,visual_identity,client_id').eq('id', brandId).eq('organization_id', organizationId).maybeSingle();
  const factsResult = await supabase.from('brand_facts').select('key,value').eq('brand_id', brandId).eq('organization_id', organizationId).eq('approved', true).order('key', { ascending: true }).limit(40);
  const insightsResult = await supabase.from('brand_insights').select('category,title,description,priority,metadata').eq('brand_id', brandId).eq('organization_id', organizationId).order('priority', { ascending: true }).order('created_at', { ascending: false }).limit(80);
  const sourcesResult = await supabase.from('brand_sources').select('url,canonical_url,title').eq('brand_id', brandId).eq('organization_id', organizationId).order('retrieved_at', { ascending: false }).limit(20);
  const runsResult = await supabase.from('research_runs').select('id').eq('brand_id', brandId).eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(1);
  for (const result of [brandResult, factsResult, insightsResult, sourcesResult, runsResult]) if (result.error) throw result.error;

  let strategyRows: Array<Record<string, unknown>> = [];
  let campaignPrimaryStrategyId: string | null = null;
  if (campaignId) {
    const campaignResult = await supabase.from('campaigns').select('id,brand_id,organization_id,strategy_id').eq('id', campaignId).eq('brand_id', brandId).eq('organization_id', organizationId).maybeSingle();
    if (campaignResult.error) throw campaignResult.error;
    campaignPrimaryStrategyId = (campaignResult.data?.strategy_id as string | null) ?? null;
    if (campaignResult.data) {
      const campaignStrategies = await supabase.from('campaign_strategies').select('strategy:strategies(id,title,version,output,provider,model,status),is_primary,sort_order').eq('campaign_id', campaignId).eq('organization_id', organizationId).order('sort_order', { ascending: true });
      if (!campaignStrategies.error) {
        strategyRows = ((campaignStrategies.data ?? []) as Array<Record<string, unknown>>).map((row) => row.strategy as Record<string, unknown> | null).filter((row): row is Record<string, unknown> => Boolean(row));
      } else if (campaignPrimaryStrategyId) {
        const legacyStrategy = await supabase.from('strategies').select('id,title,version,output,provider,model,status').eq('id', campaignPrimaryStrategyId).eq('brand_id', brandId).eq('organization_id', organizationId).eq('status', 'SUCCEEDED').maybeSingle();
        if (legacyStrategy.error) throw legacyStrategy.error;
        if (legacyStrategy.data) strategyRows = [legacyStrategy.data as Record<string, unknown>];
      }
    }
  }

  if (strategyRows.length === 0) {
    const strategyResult = await supabase.from('strategies').select('id,title,version,output,provider,model,status').eq('brand_id', brandId).eq('organization_id', organizationId).eq('status', 'SUCCEEDED').order('version', { ascending: false }).limit(1).maybeSingle();
    if (strategyResult.error) throw strategyResult.error;
    if (strategyResult.data) strategyRows = [strategyResult.data as Record<string, unknown>];
  }

  const suggestionRows = await loadSuggestionRows(supabase, { organizationId, brandId });
  const approvedSuggestionRows = suggestionRows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED');
  const facts: StrategyFact[] = [...approvedSuggestionRows.map((row) => ({ key: row.label || row.field, value: row.proposed_value }))];
  const suggestionKeys = new Set(suggestionRows.map((row) => row.field));
  for (const row of (factsResult.data ?? []) as Array<{ key: string; value: unknown }>) if (!suggestionKeys.has(row.key)) facts.push({ key: row.key, value: row.value });
  const insightRows = (insightsResult.data ?? []) as Array<{ category: string; title: string; description: string | null; priority: number; metadata: { claimUrl?: string | null } | null }>;
  const insights: StrategyInsight[] = insightRows.map((row) => ({ category: row.category, title: row.title, description: row.description, priority: row.priority }));
  const evidenceClaims: StrategyEvidenceClaim[] = insightRows.filter((row) => row.category === 'EVIDENCE').map((row) => ({ claim: row.description ?? row.title, sourceUrl: row.metadata?.claimUrl ?? null }));
  const sources: StrategySource[] = (sourcesResult.data ?? []).map((row: any) => ({ url: row.canonical_url ?? row.url ?? '', title: row.title })).filter((source: StrategySource) => Boolean(source.url));
  const strategies = strategyRows.map(normalizeStrategy).filter((strategy): strategy is ApprovedStrategyRef => Boolean(strategy));

  return {
    brand: { name: brandResult.data?.name ?? '', websiteUrl: brandResult.data?.website_url ?? null, industry: brandResult.data?.industry ?? null, marketCountry: brandResult.data?.market_country ?? null, targetAudience: brandResult.data?.target_audience ?? null, primaryColor: brandResult.data?.primary_color ?? null, secondaryColors: Array.isArray(brandResult.data?.secondary_colors) ? brandResult.data.secondary_colors : [], brandRules: (brandResult.data?.brand_rules ?? {}) as Record<string, unknown>, audienceDetails: (brandResult.data?.audience_details ?? {}) as Record<string, unknown>, offerDetails: (brandResult.data?.offer_details ?? {}) as Record<string, unknown>, positioning: (brandResult.data?.positioning ?? {}) as Record<string, unknown>, messaging: (brandResult.data?.messaging ?? {}) as Record<string, unknown>, visualIdentity: (brandResult.data?.visual_identity ?? {}) as Record<string, unknown>, clientId: brandResult.data?.client_id ?? null },
    facts, insights, evidenceClaims, sources, suggestionRows, researchRunId: runsResult.data?.[0]?.id ?? null, strategy: strategies[0] ?? null, strategies,
  };
}

export function evaluateContentGate(snapshot: ContentSnapshot): ContentGate {
  const rows = snapshot.suggestionRows;
  const strategies = snapshot.strategies ?? (snapshot.strategy ? [snapshot.strategy] : []);
  const counts = { suggestions: rows.length, approved: rows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED').length, missing: [] as string[] };
  const strategy = { ready: strategies.length > 0, version: snapshot.strategy?.version ?? null, count: strategies.length };
  if (rows.length === 0) return { ok: false, code: 'INSUFFICIENT_BRAIN', message: 'Import the brand website and review the Brand Brain suggestions first. No approved brand intelligence exists yet for this brand.', counts, strategy };
  const gate = checkApprovalGate(rows);
  if (!gate.ok) { counts.missing = gate.missing; return { ok: false, code: 'INSUFFICIENT_APPROVED_BRAIN', message: strategyGateMessage(rows), counts, strategy }; }
  if (!strategies.length) return { ok: false, code: 'INSUFFICIENT_STRATEGY', message: 'An approved strategy is required before generating content. Generate and approve a strategy for this brand first.', counts, strategy };
  return { ok: true, code: null, message: '', counts, strategy };
}

export type ContentBrainContext = BrainSnapshot;

export function toContentBrainContext(snapshot: ContentSnapshot): ContentBrainContext {
  return { brand: snapshot.brand, facts: snapshot.facts, insights: snapshot.insights, evidenceClaims: snapshot.evidenceClaims, sources: snapshot.sources, researchRunId: snapshot.researchRunId };
}