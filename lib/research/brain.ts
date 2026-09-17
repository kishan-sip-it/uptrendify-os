import type { SupabaseClient } from '@supabase/supabase-js';
import { createDefaultRegistry } from '@/lib/ai/registry';
import { AiProviderError, type AiProvider } from '@/lib/ai/types';
import {
  buildEvidenceContext,
  extractBrandIntelligence,
  type BrandIntelligence,
  type EvidenceFragment,
  type ExtractionOutcome,
} from '@/lib/ai/brand-intelligence';
import { obs } from '@/lib/obs/logger';

export const BRAIN_TASK_TYPE = 'brand_intelligence';
export const INSIGHT_ORIGIN = 'brand-intelligence';
export const AI_INFERRED_FACT_CONFIDENCE = 0.95;

const SECTION_KEYS = ['identity', 'audience', 'positioning', 'offer', 'messaging', 'seo', 'competition'] as const;

const BRAIN_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;
const TRANSIENT_PATTERNS = ['fetch failed', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'AbortError', '503', '429', 'UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'high demand', 'temporarily'];

export type BrainOutcome = {
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  aiTaskId?: string;
  provider?: string;
  model?: string;
  factsWritten?: number;
  insightsWritten?: number;
  errorCode?: string;
  errorMessage?: string;
};

export type AnalyzeDeps = {
  provider?: AiProvider | null;
};

export type BrainFactRow = {
  organization_id: string;
  brand_id: string;
  key: string;
  value: unknown;
  source_type: 'AI_INFERRED';
  confidence: number;
  evidence_source_ids: string[];
  approved: boolean;
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

function hasData(section: Record<string, unknown>): boolean {
  return Object.values(section).some((value) => {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  });
}

function shorten(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function isTransientProviderError(error: unknown): boolean {
  if (error instanceof AiProviderError) {
    return error.status === 429 || error.status === 502 || error.status === 503;
  }
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_PATTERNS.some((pattern) => message.includes(pattern));
}

async function extractWithRetry(
  provider: AiProvider,
  evidence: EvidenceFragment[],
  maxAttempts = BRAIN_MAX_ATTEMPTS,
): Promise<ExtractionOutcome> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await extractBrandIntelligence(provider, evidence);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isTransientProviderError(error)) throw error;
      obs.info('Retrying brand intelligence after transient provider error', {
        provider: provider.id,
        attempt,
        error: error instanceof Error ? error.message.slice(0, 300) : String(error),
      });
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

export function mapIntelligenceToRows(
  intelligence: BrandIntelligence,
  sourceIndex: Map<string, string>,
  organizationId: string,
  brandId: string,
  researchRunId: string,
): { facts: BrainFactRow[]; insights: BrainInsightRow[] } {
  const citedIds = [
    ...new Set(intelligence.evidence.map((entry) => sourceIndex.get(entry.sourceUrl)).filter((id): id is string => Boolean(id))),
  ];

  const facts: BrainFactRow[] = [];
  for (const key of SECTION_KEYS) {
    const section = intelligence[key];
    if (!section || !hasData(section)) continue;
    facts.push({
      organization_id: organizationId,
      brand_id: brandId,
      key,
      value: section,
      source_type: 'AI_INFERRED',
      confidence: AI_INFERRED_FACT_CONFIDENCE,
      evidence_source_ids: citedIds,
      approved: false,
    });
  }

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

  return { facts, insights };
}

export async function persistBrainRows(
  supabase: SupabaseClient,
  rows: { facts: BrainFactRow[]; insights: BrainInsightRow[] },
  brandId: string,
  organizationId: string,
): Promise<{ factsWritten: number; insightsWritten: number }> {
  const factsDelete = await supabase
    .from('brand_facts')
    .delete()
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .eq('source_type', 'AI_INFERRED');
  if (factsDelete.error) throw factsDelete.error;

  const insightsDelete = await supabase
    .from('brand_insights')
    .delete()
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .eq('metadata->>origin', INSIGHT_ORIGIN);
  if (insightsDelete.error) throw insightsDelete.error;

  if (rows.facts.length > 0) {
    const factsInsert = await supabase.from('brand_facts').insert(rows.facts);
    if (factsInsert.error) throw factsInsert.error;
  }
  if (rows.insights.length > 0) {
    const insightsInsert = await supabase.from('brand_insights').insert(rows.insights);
    if (insightsInsert.error) throw insightsInsert.error;
  }

  return { factsWritten: rows.facts.length, insightsWritten: rows.insights.length };
}

export async function analyzeResearchEvidence(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; researchRunId: string },
  deps: AnalyzeDeps = {},
): Promise<BrainOutcome> {
  const { organizationId, brandId, researchRunId } = args;

  const { data: runSources, error: sourcesError } = await supabase
    .from('research_sources')
    .select('brand_sources!inner(id,url,canonical_url,title,extracted_text)')
    .eq('research_run_id', researchRunId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (sourcesError) {
    obs.error('Failed to load research sources for brain analysis', { researchRunId, error: sourcesError.message });
    return { status: 'SKIPPED', errorCode: 'SOURCES_UNREADABLE', errorMessage: sourcesError.message };
  }

  const sources = (runSources ?? [])
    .map((row: any) => row.brand_sources)
    .filter((source: any) => Boolean(source));

  const fragments: EvidenceFragment[] = sources.map((source: any) => ({
    url: source.canonical_url ?? source.url,
    title: source.title ?? null,
    text: source.extracted_text ?? '',
  }));

  const evidence = buildEvidenceContext(fragments);
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

    const sourceIndex = new Map<string, string>();
    for (let i = 0; i < sources.length; i += 1) {
      const source = sources[i];
      const url = source.canonical_url ?? source.url;
      sourceIndex.set(url, source.id);
    }

    const rows = mapIntelligenceToRows(result, sourceIndex, organizationId, brandId, researchRunId);
    const counts = await persistBrainRows(supabase, rows, brandId, organizationId);

    const outputMetadata = {
      facts: counts.factsWritten,
      insights: counts.insightsWritten,
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
      facts: counts.factsWritten, insights: counts.insightsWritten,
    });

    return {
      status: 'SUCCEEDED',
      aiTaskId,
      provider: providerId,
      model: extraction.model,
      factsWritten: counts.factsWritten,
      insightsWritten: counts.insightsWritten,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = 'AI_ANALYSIS_FAILED';
    obs.error('Brand intelligence analysis failed', { researchRunId, brandId, provider: providerId, model, error: message });
    await failTask(code, message);
    return { status: 'FAILED', aiTaskId, provider: providerId, model, errorCode: code, errorMessage: message };
  }
}