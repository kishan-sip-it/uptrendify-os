import type { SupabaseClient } from '@supabase/supabase-js';
import { checkApprovalGate, loadSuggestionRows, type SuggestionRow } from '@/lib/brain/review';
import { gateMessage as strategyGateMessage } from '@/lib/strategy/pipeline';
import type {
  BrainSnapshot,
  StrategyBrandMeta,
  StrategyEvidenceClaim,
  StrategyFact,
  StrategyInsight,
  StrategySource,
} from '@/lib/strategy/context';
import type { StrategyOutput } from '@/lib/strategy/schema';

export type ContentBrandMeta = StrategyBrandMeta & { clientId?: string | null };

export type ApprovedStrategyRef = {
  id: string;
  version: number;
  title: string;
  output: StrategyOutput;
  provider: string | null;
  model: string | null;
};

export type ContentSnapshot = {
  brand: ContentBrandMeta;
  facts: StrategyFact[];
  insights: StrategyInsight[];
  evidenceClaims: StrategyEvidenceClaim[];
  sources: StrategySource[];
  suggestionRows: SuggestionRow[];
  researchRunId: string | null;
  strategy: ApprovedStrategyRef | null;
};

export type ContentGate = {
  ok: boolean;
  code: 'INSUFFICIENT_BRAIN' | 'INSUFFICIENT_APPROVED_BRAIN' | 'INSUFFICIENT_STRATEGY' | null;
  message: string;
  counts: { suggestions: number; approved: number; missing: string[] };
  strategy: { ready: boolean; version: number | null };
};

export async function loadContentSnapshot(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string },
): Promise<ContentSnapshot> {
  const { organizationId, brandId } = args;

  const brandResult = await supabase
    .from('brands')
    .select('name,website_url,industry,market_country,target_audience,client_id')
    .eq('id', brandId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  const factsResult = await supabase
    .from('brand_facts')
    .select('key,value')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .eq('approved', true)
    .order('key', { ascending: true })
    .limit(40);

  const insightsResult = await supabase
    .from('brand_insights')
    .select('category,title,description,priority,metadata')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(80);

  const sourcesResult = await supabase
    .from('brand_sources')
    .select('url,canonical_url,title')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .order('retrieved_at', { ascending: false })
    .limit(20);

  const runsResult = await supabase
    .from('research_runs')
    .select('id')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(1);

  const strategyResult = await supabase
    .from('strategies')
    .select('id,title,version,output,provider,model')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .eq('status', 'SUCCEEDED')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  for (const result of [brandResult, factsResult, insightsResult, sourcesResult, runsResult, strategyResult]) {
    if (result.error) throw result.error;
  }

  const suggestionRows = await loadSuggestionRows(supabase, { organizationId, brandId });
  const approvedSuggestionRows = suggestionRows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED');

  const facts: StrategyFact[] = [...approvedSuggestionRows.map((row) => ({ key: row.label || row.field, value: row.proposed_value }))];
  const suggestionKeys = new Set(suggestionRows.map((row) => row.field));
  for (const row of (factsResult.data ?? []) as Array<{ key: string; value: unknown }>) {
    if (!suggestionKeys.has(row.key)) facts.push({ key: row.key, value: row.value });
  }

  const insightRows = (insightsResult.data ?? []) as Array<{
    category: string;
    title: string;
    description: string | null;
    priority: number;
    metadata: { claimUrl?: string | null } | null;
  }>;
  const insights: StrategyInsight[] = insightRows.map((row) => ({
    category: row.category,
    title: row.title,
    description: row.description,
    priority: row.priority,
  }));
  const evidenceClaims: StrategyEvidenceClaim[] = insightRows
    .filter((row) => row.category === 'EVIDENCE')
    .map((row) => ({ claim: row.description ?? row.title, sourceUrl: row.metadata?.claimUrl ?? null }));
  const sources: StrategySource[] = (sourcesResult.data ?? [])
    .map((row: any) => ({ url: row.canonical_url ?? row.url ?? '', title: row.title }))
    .filter((source: StrategySource) => Boolean(source.url));

  const strategyRow = strategyResult.data as {
    id: string;
    title: string;
    version: number;
    output: StrategyOutput | null;
    provider: string | null;
    model: string | null;
  } | null;
  const strategy: ApprovedStrategyRef | null =
    strategyRow && strategyRow.output && Object.keys(strategyRow.output).length > 0
      ? {
          id: strategyRow.id,
          version: strategyRow.version,
          title: strategyRow.title,
          output: strategyRow.output,
          provider: strategyRow.provider,
          model: strategyRow.model,
        }
      : null;

  return {
    brand: {
      name: brandResult.data?.name ?? '',
      websiteUrl: brandResult.data?.website_url ?? null,
      industry: brandResult.data?.industry ?? null,
      marketCountry: brandResult.data?.market_country ?? null,
      targetAudience: brandResult.data?.target_audience ?? null,
      clientId: brandResult.data?.client_id ?? null,
    },
    facts,
    insights,
    evidenceClaims,
    sources,
    suggestionRows,
    researchRunId: runsResult.data?.[0]?.id ?? null,
    strategy,
  };
}

export function evaluateContentGate(snapshot: ContentSnapshot): ContentGate {
  const rows = snapshot.suggestionRows;
  const counts = {
    suggestions: rows.length,
    approved: rows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED').length,
    missing: [] as string[],
  };
  const strategy = { ready: Boolean(snapshot.strategy), version: snapshot.strategy?.version ?? null };

  if (rows.length === 0) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BRAIN',
      message:
        'Import the brand website and review the Brand Brain suggestions first. No approved brand intelligence exists yet for this brand.',
      counts,
      strategy,
    };
  }

  const gate = checkApprovalGate(rows);
  if (!gate.ok) {
    counts.missing = gate.missing;
    return {
      ok: false,
      code: 'INSUFFICIENT_APPROVED_BRAIN',
      message: strategyGateMessage(rows),
      counts,
      strategy,
    };
  }

  if (!snapshot.strategy) {
    return {
      ok: false,
      code: 'INSUFFICIENT_STRATEGY',
      message:
        'An approved strategy is required before generating content. Generate and approve the strategy for this brand first.',
      counts,
      strategy,
    };
  }

  return { ok: true, code: null, message: '', counts, strategy };
}

export type ContentBrainContext = BrainSnapshot;

export function toContentBrainContext(snapshot: ContentSnapshot): ContentBrainContext {
  return {
    brand: {
      name: snapshot.brand.name,
      websiteUrl: snapshot.brand.websiteUrl ?? undefined,
      industry: snapshot.brand.industry ?? undefined,
      marketCountry: snapshot.brand.marketCountry ?? undefined,
      targetAudience: snapshot.brand.targetAudience ?? undefined,
    },
    facts: snapshot.facts,
    insights: snapshot.insights,
    evidenceClaims: snapshot.evidenceClaims,
    sources: snapshot.sources,
    researchRunId: snapshot.researchRunId,
  };
}