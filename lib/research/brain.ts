import type { SupabaseClient } from '@supabase/supabase-js';
import { createDefaultRegistry } from '@/lib/ai/registry';
import type { AiProvider } from '@/lib/ai/types';
import {
  buildEvidenceContext,
  extractBrandIntelligence,
  isBrandValidationError,
  type BrandIntelligence,
  type EvidenceFragment,
  type ExtractionOutcome,
} from '@/lib/ai/brand-intelligence';
import { withTransientRetry } from '@/lib/ai/retry';
import { classifyProviderFailure } from '@/lib/ai/classify';
import { obs } from '@/lib/obs/logger';
import { deriveAllSuggestionDrafts, persistSuggestionDrafts } from '@/lib/brain/suggestions';

export const BRAIN_TASK_TYPE = 'brand_intelligence';
export const INSIGHT_ORIGIN = 'brand-intelligence';
export const AI_INFERRED_FACT_CONFIDENCE = 0.95;

const SECTION_KEYS = ['identity', 'audience', 'positioning', 'offer', 'messaging', 'seo', 'competition'] as const;

export type BrainOutcome = {
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  aiTaskId?: string;
  provider?: string;
  model?: string;
  suggestionsWritten?: number;
  suggestionsFound?: number;
  suggestionsNotFound?: number;
  insightsWritten?: number;
  errorCode?: string;
  errorMessage?: string;
};

export type AnalyzeDeps = {
  provider?: AiProvider | null;
};

export type BrainInsightRow = {
  organization_id: string;
  brand_id: string;
  category: string;
  title: string;
  description: string;
  priority: number;
  evidence_source_ids: string[];
  metadata: Record<string, unknown>;
};

function shorten(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export async function extractWithRetry(
  provider: AiProvider,
  evidence: EvidenceFragment[],
): Promise<ExtractionOutcome> {
  return withTransientRetry(() => extractBrandIntelligence(provider, evidence), {
    label: 'brand intelligence',
    providerId: provider.id,
  });
}

export type EvidenceBundle = {
  sources: Array<{ id: string; url: string; canonicalUrl: string; title: string | null; text: string }>;
  fragments: EvidenceFragment[];
  sourceIndex: Map<string, string>;
};

export function sourceIndexFromSources(sources: EvidenceBundle['sources']): Map<string, string> {
  const index = new Map<string, string>();
  for (const source of sources) index.set(source.canonicalUrl || source.url, source.id);
  return index;
}

export function bundleFromRows(rows: any[]): EvidenceBundle {
  const sources = rows
    .map((row) => row.brand_sources)
    .filter((source) => Boolean(source))
    .map((source: any) => ({
      id: source.id as string,
      url: source.url as string,
      canonicalUrl: (source.canonical_url ?? source.url) as string,
      title: (source.title ?? null) as string | null,
      text: (source.extracted_text ?? '') as string,
    }));

  const fragments: EvidenceFragment[] = sources
    .filter((source) => source.text.trim() !== '')
    .map((source) => ({ url: source.canonicalUrl || source.url, title: source.title, text: source.text }));

  return { sources, fragments, sourceIndex: sourceIndexFromSources(sources) };
}

async function loadRunEvidence(
  supabase: SupabaseClient,
  organizationId: string,
  researchRunId: string,
): Promise<EvidenceBundle> {
  const { data, error } = await supabase
    .from('research_sources')
    .select('brand_sources!inner(id,url,canonical_url,title,extracted_text)')
    .eq('research_run_id', researchRunId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return bundleFromRows(data ?? []);
}

export async function loadBrandEvidence(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string },
): Promise<{ researchRunId: string; bundle: EvidenceBundle } | null> {
  const { organizationId, brandId } = args;
  const { data: runs, error } = await supabase
    .from('research_runs')
    .select('id,status')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .in('status', ['COMPLETED', 'PARTIAL'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const runId = runs?.[0]?.id;
  if (!runId) return null;
  const bundle = await loadRunEvidence(supabase, organizationId, runId);
  return { researchRunId: runId, bundle };
}

export function mapIntelligenceToInsights(
  intelligence: BrandIntelligence,
  sourceIndex: Map<string, string>,
  organizationId: string,
  brandId: string,
  researchRunId: string,
): BrainInsightRow[] {
  const citedIds = [
    ...new Set(intelligence.evidence.map((entry) => sourceIndex.get(entry.sourceUrl)).filter((id): id is string => Boolean(id))),
  ];

  const insights: BrainInsightRow[] = [];
  const templates: Array<{ from: (i: BrandIntelligence) => string[] | undefined; category: string; priority: number }> = [
    { from: (i) => i.positioning.differentiators, category: 'POSITIONING', priority: 1 },
    { from: (i) => i.audience.painPoints, category: 'AUDIENCE', priority: 2 },
    { from: (i) => i.messaging.messagingThemes, category: 'MESSAGING', priority: 2 },
    { from: (i) => i.seo.contentGaps, category: 'SEO', priority: 2 },
    { from: (i) => i.seo.searchIntentOpportunities, category: 'SEO', priority: 3 },
    { from: (i) => i.competition.differentiationClaims, category: 'COMPETITION', priority: 3 },
  ];

  for (const template of templates) {
    for (const item of template.from(intelligence) ?? []) {
      if (!item) continue;
      insights.push({
        organization_id: organizationId,
        brand_id: brandId,
        category: template.category,
        title: shorten(item),
        description: item,
        priority: template.priority,
        evidence_source_ids: citedIds,
        metadata: { origin: INSIGHT_ORIGIN, researchRunId },
      });
    }
  }

  for (const claim of intelligence.evidence) {
    const sourceId = sourceIndex.get(claim.sourceUrl);
    insights.push({
      organization_id: organizationId,
      brand_id: brandId,
      category: 'EVIDENCE',
      title: shorten(claim.claim),
      description: claim.claim,
      priority: 3,
      evidence_source_ids: sourceId ? [sourceId] : [],
      metadata: { origin: INSIGHT_ORIGIN, researchRunId, claimUrl: claim.sourceUrl },
    });
  }

  return insights;
}

export async function persistInsights(
  supabase: SupabaseClient,
  insights: BrainInsightRow[],
  brandId: string,
  organizationId: string,
): Promise<number> {
  const insightsDelete = await supabase
    .from('brand_insights')
    .delete()
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .eq('metadata->>origin', INSIGHT_ORIGIN);
  if (insightsDelete.error) throw insightsDelete.error;

  if (insights.length > 0) {
    const insert = await supabase.from('brand_insights').insert(insights);
    if (insert.error) throw insert.error;
  }
  return insights.length;
}

export async function analyzeResearchEvidence(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; researchRunId: string },
  deps: AnalyzeDeps = {},
): Promise<BrainOutcome> {
  const { organizationId, brandId, researchRunId } = args;

  let bundle: EvidenceBundle;
  try {
    bundle = await loadRunEvidence(supabase, organizationId, researchRunId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    obs.error('Failed to load research sources for brain analysis', { researchRunId, error: message });
    return { status: 'SKIPPED', errorCode: 'SOURCES_UNREADABLE', errorMessage: message };
  }

  const evidence = buildEvidenceContext(bundle.fragments);
  if (evidence.length === 0) {
    return { status: 'SKIPPED', errorCode: 'NO_EVIDENCE', errorMessage: 'No usable evidence was collected for analysis.' };
  }

  const aiTaskInsert = await supabase.from('ai_tasks').insert({
    organization_id: organizationId,
    brand_id: brandId,
    research_run_id: researchRunId,
    task_type: BRAIN_TASK_TYPE,
    status: 'RUNNING',
    idempotency_key: `brain:${researchRunId}`,
    input_metadata: { evidenceSources: evidence.length },
    started_at: new Date().toISOString(),
  }).select('id').single();

  let aiTaskId: string;
  if (aiTaskInsert.error) {
    if (aiTaskInsert.error.code === '23505') {
      const existing = await supabase.from('ai_tasks').select('id').eq('organization_id', organizationId).eq('idempotency_key', `brain:${researchRunId}`).maybeSingle();
      if (existing.error || !existing.data) throw aiTaskInsert.error;
      aiTaskId = existing.data.id;
    } else {
      throw aiTaskInsert.error;
    }
  } else {
    aiTaskId = aiTaskInsert.data.id;
  }

  const failTask = async (code: string, message: string) => {
    await supabase.from('ai_tasks').update({
      status: 'FAILED',
      error_code: code,
      error_message: message?.slice(0, 600),
      finished_at: new Date().toISOString(),
    }).eq('id', aiTaskId);
  };

  let provider: AiProvider | null = deps.provider !== undefined ? deps.provider : createDefaultRegistry().default();
  const providerId = provider?.id;
  if (!provider) {
    obs.error('No configured AI provider for brand intelligence', { organizationId, brandId, researchRunId });
    await failTask('PROVIDER_UNCONFIGURED', 'No AI provider is configured.');
    return { status: 'FAILED', aiTaskId, errorCode: 'PROVIDER_UNCONFIGURED', errorMessage: 'No AI provider is configured.' };
  }

  const model = provider.defaultModel;
  const providerUpdate = await supabase.from('ai_tasks').update({
    provider: providerId,
    model,
  }).eq('id', aiTaskId);
  if (providerUpdate.error) throw providerUpdate.error;

  const startedAt = Date.now();
  try {
    const extraction = await extractWithRetry(provider, evidence);
    const { result } = extraction;

    const drafts = deriveAllSuggestionDrafts(result, bundle.sources, bundle.sourceIndex);
    const counts = await persistSuggestionDrafts(supabase, { organizationId, brandId, researchRunId }, drafts);

    const insightsWritten = await persistInsights(
      supabase,
      mapIntelligenceToInsights(result, bundle.sourceIndex, organizationId, brandId, researchRunId),
      brandId,
      organizationId,
    );

    const found = drafts.filter((draft) => draft.found).length;
    const notFound = drafts.length - found;
    const suggestionsWritten = counts.created + counts.updated;

    const outputMetadata = {
      suggestionsCreated: counts.created,
      suggestionsUpdated: counts.updated,
      suggestionsSkippedHumanOwned: counts.untouched,
      found,
      notFound,
      insights: insightsWritten,
      evidenceClaims: result.evidence.length,
      evidenceSources: evidence.length,
      researchRunId,
    };

    const aiTaskUpdate = await supabase.from('ai_tasks').update({
      status: 'SUCCEEDED',
      provider: providerId,
      model: extraction.model,
      output_metadata: outputMetadata,
      latency_ms: Date.now() - startedAt,
      input_tokens: extraction.usage?.inputTokens,
      output_tokens: extraction.usage?.outputTokens,
      finished_at: new Date().toISOString(),
    }).eq('id', aiTaskId);
    if (aiTaskUpdate.error) throw aiTaskUpdate.error;

    obs.info('Brand intelligence generated', {
      researchRunId, brandId, organizationId,
      provider: providerId, model: extraction.model,
      suggestions: suggestionsWritten, found, notFound,
    });

    return {
      status: 'SUCCEEDED',
      aiTaskId,
      provider: providerId,
      model: extraction.model,
      suggestionsWritten,
      suggestionsFound: found,
      suggestionsNotFound: notFound,
      insightsWritten,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = 'AI_ANALYSIS_FAILED';
    obs.error('Brand intelligence analysis failed', { researchRunId, brandId, provider: providerId, model, error: message });
    await failTask(code, message);
    return { status: 'FAILED', aiTaskId, provider: providerId, model, errorCode: code, errorMessage: message };
  }
}