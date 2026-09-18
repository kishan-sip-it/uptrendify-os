import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { obs } from '@/lib/obs/logger';
import { persistSuggestionDrafts, isEmptyValue, type EvidenceItem, type EvidenceStrength, type SuggestionDraft, type SuggestionKind } from '@/lib/brain/suggestions';
import { checkApprovalGate, GATE_MIN_APPROVED, loadSuggestionRows } from '@/lib/brain/review';
import { BRAIN_TASK_TYPE, INSIGHT_ORIGIN, persistInsights, type BrainInsightRow } from '@/lib/research/brain';
import type { StrategyOutput } from '@/lib/strategy/schema';
import type { ContentIntentLike } from '@/lib/content/schema';
import fixtureJson from './fixtures/aurora.json';

const REPLAY_STRATEGY_TASK_TYPE = 'strategy_generation';
const REPLAY_CONTENT_TASK_TYPE = 'content_generation';

const CHUNK_MAX_CHARS = 2000;
const CHUNK_OVERLAP = 150;
const MAX_CHUNKS_PER_SOURCE = 25;

export function chunkTextReplay(text: string, maxChars = CHUNK_MAX_CHARS, overlap = CHUNK_OVERLAP, maxChunks = MAX_CHUNKS_PER_SOURCE): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length && chunks.length < maxChunks) {
    chunks.push(clean.slice(start, start + maxChars));
    if (start + maxChars >= clean.length) break;
    start = start + maxChars - overlap;
  }
  if (clean.length > start && chunks.length < maxChunks) chunks.push(clean.slice(start));
  return chunks;
}

export type ReplayFixture = typeof fixtureJson;

export type FixtureSuggestionEntry = {
  field: string;
  label: string;
  section: string;
  kind: string;
  proposedValue: string | string[] | Array<{ name: string; description?: string | null }> | null;
  confidence: number;
  evidence: Array<{ url: string; claim: string; strength: EvidenceStrength; excerpt?: string | null }>;
};

export const fixture = fixtureJson as unknown as {
  meta: {
    organizationSlug: string;
    organizationName: string;
    brandName: string;
    brandSlug: string;
    brandUrl: string;
    brandIndustry: string;
    marketCountry: string;
    targetAudience: string;
    providerLabel: string;
    modelLabel: string;
  };
  run: { pagesDiscovered: number; pagesProcessed: number };
  sources: Array<{
    url: string;
    canonicalUrl: string;
    title: string;
    contentType: string;
    httpStatus: number;
    text: string;
  }>;
  approvedFields: string[];
  suggestions: FixtureSuggestionEntry[];
  insights: Array<{ category: string; title: string; description: string; priority: number; claimUrl?: string | null }>;
  strategy: StrategyOutput;
  content: {
    samples: Array<{
      type: string;
      channel: string;
      headline: string;
      body: string;
      cta: string;
      rationale: string;
      strategyReferences: string[];
      brandFactReferences: string[];
    }>;
  };
};

export const REPLAY_ORG_SLUG = fixture.meta.organizationSlug;
export const REPLAY_PROVIDER = fixture.meta.providerLabel;
export const REPLAY_MODEL = fixture.meta.modelLabel;
export const REPLAY_RESEARCH_RUN_KEY = 'replay:presentation:aurora:v1';

export function isReplayModeEnabled(): boolean {
  return env().AI_EXECUTION_MODE === 'replay';
}

export function isReplayOrgSlug(slug: string): boolean {
  return isReplayModeEnabled() && slug === REPLAY_ORG_SLUG;
}

export function isApprovedFixtureField(field: string): boolean {
  return fixture.approvedFields.includes(field);
}

export function fixtureSourceByIdentifier(identifier: string): typeof fixture.sources[number] | null {
  return fixture.sources.find((source) => source.canonicalUrl === identifier || source.url === identifier) ?? null;
}

type SourceIndex = Map<string, string>;
type UrlTitleIndex = Map<string, string | null>;

function strongestStrength(strengths: EvidenceStrength[]): EvidenceStrength {
  if (strengths.includes('strong')) return 'strong';
  if (strengths.includes('partial')) return 'partial';
  return 'weak';
}

export function buildReplayDraft(entry: FixtureSuggestionEntry, sourceIndex: SourceIndex, urlTitles: UrlTitleIndex): SuggestionDraft {
  const evidence: EvidenceItem[] = entry.evidence.map((item) => ({
    sourceId: sourceIndex.get(item.url) ?? null,
    url: item.url,
    urlTitle: urlTitles.get(item.url) ?? null,
    excerpt: item.excerpt ?? null,
    claim: item.claim,
    strength: item.strength,
  }));
  const found = !isEmptyValue(entry.proposedValue);
  const capped = evidence.slice(0, 6);
  return {
    field: entry.field,
    label: entry.label,
    section: entry.section,
    kind: entry.kind as SuggestionKind,
    proposedValue: entry.proposedValue,
    found,
    status: found ? 'PENDING' : 'NOT_FOUND',
    evidence: found ? capped : [],
    evidenceStrength: found ? strongestStrength(capped.map((item) => item.strength)) : null,
    sourcesExamined: candidateSourceCount(),
    confidence: entry.confidence,
  };
}

export function candidateSourceCount(): number {
  return fixture.sources.length;
}

export function buildReplayDrafts(sourceIndex: SourceIndex, urlTitles: UrlTitleIndex): SuggestionDraft[] {
  return fixture.suggestions.map((entry) => buildReplayDraft(entry, sourceIndex, urlTitles));
}

export function fixtureDraftFor(field: string, sourceIndex: SourceIndex, urlTitles: UrlTitleIndex): SuggestionDraft | null {
  const entry = fixture.suggestions.find((suggestion) => suggestion.field === field);
  return entry ? buildReplayDraft(entry, sourceIndex, urlTitles) : null;
}

async function sourceIndexes(supabase: SupabaseClient, args: { organizationId: string; brandId: string }): Promise<{
  sourceIndex: SourceIndex;
  urlTitles: UrlTitleIndex;
}> {
  const { data, error } = await supabase
    .from('brand_sources')
    .select('id,url,canonical_url,title')
    .eq('brand_id', args.brandId)
    .eq('organization_id', args.organizationId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const sourceIndex: SourceIndex = new Map();
  const urlTitles: UrlTitleIndex = new Map();
  for (const row of data ?? []) {
    const identifier = row.canonical_url ?? row.url;
    sourceIndex.set(identifier, row.id);
    sourceIndex.set(row.url, row.id);
    urlTitles.set(identifier, row.title ?? null);
    urlTitles.set(row.url, row.title ?? null);
  }
  return { sourceIndex, urlTitles };
}

function replayInsightRows(args: { organizationId: string; brandId: string; researchRunId: string }): BrainInsightRow[] {
  const { organizationId, brandId, researchRunId } = args;
  return fixture.insights.map((insight) => ({
    organization_id: organizationId,
    brand_id: brandId,
    category: insight.category,
    title: insight.title,
    description: insight.description,
    priority: insight.priority,
    evidence_source_ids: [],
    metadata: {
      origin: INSIGHT_ORIGIN,
      researchRunId,
      ...(insight.claimUrl ? { claimUrl: insight.claimUrl } : {}),
    },
  }));
}

export async function isReplayOrganization(supabase: SupabaseClient, organizationId: string): Promise<boolean> {
  if (!isReplayModeEnabled()) return false;
  const { data, error } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return isReplayOrgSlug(data?.slug ?? '');
}

export type ReplayResearchOutcome = {
  status: 'COMPLETED';
  brainStatus: 'SUCCEEDED';
  pagesProcessed: number;
  pagesDiscovered: number;
};

export async function completeReplayResearchRun(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; researchRunId: string; userId?: string | null },
): Promise<ReplayResearchOutcome> {
  const { organizationId, brandId, researchRunId, userId } = args;
  const now = new Date().toISOString();
  const pagesProcessed = fixture.run.pagesProcessed;
  const pagesDiscovered = fixture.run.pagesDiscovered;

  const sourceDelete = await supabase
    .from('brand_sources')
    .delete()
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId);
  if (sourceDelete.error) throw sourceDelete.error;

  const sourceRows = fixture.sources.map((source) => ({
    organization_id: organizationId,
    brand_id: brandId,
    url: source.url,
    canonical_url: source.canonicalUrl,
    title: source.title,
    content_type: source.contentType,
    status: 'ACTIVE',
    http_status: source.httpStatus,
    retrieved_at: now,
    extracted_text: source.text,
    metadata: { replay: true, researchRunId },
  }));
  const sourceInsert = await supabase.from('brand_sources').insert(sourceRows).select('id,url,canonical_url');
  if (sourceInsert.error) throw sourceInsert.error;
  const insertedSources = (sourceInsert.data ?? []) as Array<{ id: string; url: string; canonical_url: string | null }>;

  const { sourceIndex, urlTitles } = sourceIndexesFromRows(insertedSources);

  if (insertedSources.length > 0) {
    const linkRows = insertedSources.map((source) => ({
      organization_id: organizationId,
      research_run_id: researchRunId,
      source_id: source.id,
      status: 'PROCESSED',
    }));
    const linkInsert = await supabase.from('research_sources').insert(linkRows);
    if (linkInsert.error) throw linkInsert.error;

    for (const source of insertedSources) {
        const src = fixtureSourceByIdentifier(source.canonical_url ?? source.url);
        const content = src?.text ?? '';
        const chunks = chunkTextReplay(content);
        const chunkRows = chunks.map((contentChunk, chunkIndex) => ({
          organization_id: organizationId,
          brand_id: brandId,
          source_id: source.id,
          chunk_index: chunkIndex,
          content: contentChunk,
          metadata: { researchRunId, replay: true },
        }));
        if (chunkRows.length > 0) {
          const chunkInsert = await supabase.from('brand_source_chunks').upsert(chunkRows, { onConflict: 'source_id,chunk_index' });
          if (chunkInsert.error) throw chunkInsert.error;
        }
      }
  }

  const runUpdate = await supabase
    .from('research_runs')
    .update({
      status: 'COMPLETED',
      pages_processed: pagesProcessed,
      pages_discovered: pagesDiscovered,
      provider: REPLAY_PROVIDER,
      model: REPLAY_MODEL,
      error_code: null,
      error_message: null,
      started_at: now,
      finished_at: now,
    })
    .eq('id', researchRunId)
    .eq('organization_id', organizationId);
  if (runUpdate.error) throw runUpdate.error;

  const aiInsert = await supabase.from('ai_tasks').insert({
    organization_id: organizationId,
    brand_id: brandId,
    research_run_id: researchRunId,
    task_type: BRAIN_TASK_TYPE,
    status: 'SUCCEEDED',
    provider: REPLAY_PROVIDER,
    model: REPLAY_MODEL,
    idempotency_key: `brain:${researchRunId}`,
    input_metadata: { replay: true, evidenceSources: fixture.sources.length },
    output_metadata: {
      replay: true,
      suggestionsCreated: 0,
      found: fixture.suggestions.filter((s) => !isEmptyValue(s.proposedValue)).length,
      notFound: 0,
      insights: fixture.insights.length,
      researchRunId,
    },
    latency_ms: 0,
    started_at: now,
    finished_at: now,
  });
  if (aiInsert.error) throw aiInsert.error;

  const drafts = buildReplayDrafts(sourceIndex, urlTitles);
  await persistSuggestionDrafts(supabase, { organizationId, brandId, researchRunId }, drafts);
  await persistInsights(supabase, replayInsightRows({ organizationId, brandId, researchRunId }), brandId, organizationId);

  if (userId) {
    await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      actor_user_id: userId,
      action: 'research.completed',
      entity_type: 'brand',
      entity_id: brandId,
      metadata: { replay: true, provider: REPLAY_PROVIDER, researchRunId },
    });
  }

  obs.info('Replay research run completed', { researchRunId, brandId, organizationId, pagesProcessed });
  return { status: 'COMPLETED', brainStatus: 'SUCCEEDED', pagesProcessed, pagesDiscovered };
}

function sourceIndexesFromRows(rows: Array<{ id: string; url: string; canonical_url: string | null }>): {
  sourceIndex: SourceIndex;
  urlTitles: UrlTitleIndex;
} {
  const sourceIndex: SourceIndex = new Map();
  const urlTitles: UrlTitleIndex = new Map();
  for (const row of rows) {
    const identifier = row.canonical_url ?? row.url;
    sourceIndex.set(identifier, row.id);
    sourceIndex.set(row.url, row.id);
    const src = fixtureSourceByIdentifier(identifier);
    urlTitles.set(identifier, src?.title ?? null);
    urlTitles.set(row.url, src?.title ?? null);
  }
  return { sourceIndex, urlTitles };
}

export type ReplayStrategyOutcome = {
  status: 'SUCCEEDED' | 'FAILED';
  version: number;
  errorCode?: string;
  errorMessage?: string;
};

function gateCheckMessage(suggestionRows: Awaited<ReturnType<typeof loadSuggestionRows>>): string {
  const { missing } = checkApprovalGate(suggestionRows);
  const approved = suggestionRows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED').length;
  return [
    `Review and approve the Brand Brain suggestions first. Currently ${approved}/${GATE_MIN_APPROVED} required fields are approved, and ${missing.length} required field${missing.length === 1 ? '' : 's'} (${missing.join(', ')}) need approval.`,
  ].join(' ');
}

export async function completeReplayStrategy(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; strategyId: string; userId?: string | null; input: { version: number } },
): Promise<ReplayStrategyOutcome> {
  const { organizationId, brandId, strategyId, userId, input } = args;
  const now = new Date().toISOString();

  const suggestionRows = await loadSuggestionRows(supabase, { organizationId, brandId });
  const gate = checkApprovalGate(suggestionRows);

  const strategyUpdate = await supabase
    .from('strategies')
    .update({ status: 'RUNNING', started_at: now })
    .eq('id', strategyId)
    .eq('organization_id', organizationId);
  if (strategyUpdate.error) throw strategyUpdate.error;

  if (!gate.ok) {
    const message = gateCheckMessage(suggestionRows);
    await supabase.from('ai_tasks').insert({
      organization_id: organizationId,
      brand_id: brandId,
      strategy_id: strategyId,
      task_type: REPLAY_STRATEGY_TASK_TYPE,
      status: 'FAILED',
      provider: REPLAY_PROVIDER,
      model: REPLAY_MODEL,
      idempotency_key: `strategy:${strategyId}:fail`,
      input_metadata: { replay: true },
      error_code: 'INSUFFICIENT_APPROVED_BRAIN',
      error_message: message.slice(0, 600),
      started_at: now,
      finished_at: now,
    });
    const failedUpdate = await supabase
      .from('strategies')
      .update({ status: 'FAILED', error_code: 'INSUFFICIENT_APPROVED_BRAIN', error_message: message, finished_at: now })
      .eq('id', strategyId)
      .eq('organization_id', organizationId);
    if (failedUpdate.error) throw failedUpdate.error;
    obs.info('Replay strategy blocked by approval gate', { strategyId, brandId, organizationId });
    return { status: 'FAILED', version: input.version, errorCode: 'INSUFFICIENT_APPROVED_BRAIN', errorMessage: message };
  }

  const runsResult = await supabase
    .from('research_runs')
    .select('id')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .in('status', ['COMPLETED', 'PARTIAL'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runsResult.error) throw runsResult.error;
  const researchRunId = runsResult.data?.id ?? null;

  const sourcesResult = await supabase
    .from('brand_sources')
    .select('url,canonical_url,title')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .order('retrieved_at', { ascending: false })
    .limit(20);
  if (sourcesResult.error) throw sourcesResult.error;

  const output: StrategyOutput = fixture.strategy;
  const inputSnapshot = {
    researchRunId,
    brand: { name: fixture.meta.brandName, websiteUrl: fixture.meta.brandUrl, industry: fixture.meta.brandIndustry, marketCountry: null, targetAudience: null },
    facts: suggestionRows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED').length,
    insights: fixture.insights.filter((insight) => insight.category !== 'EVIDENCE').length,
    evidenceClaims: fixture.insights.filter((insight) => insight.category === 'EVIDENCE').length,
    sources: sourcesResult.data?.length ?? 0,
  };

  const succeededUpdate = await supabase
    .from('strategies')
    .update({
      status: 'SUCCEEDED',
      provider: REPLAY_PROVIDER,
      model: REPLAY_MODEL,
      output,
      input_snapshot: inputSnapshot,
      error_code: null,
      error_message: null,
      finished_at: now,
    })
    .eq('id', strategyId)
    .eq('organization_id', organizationId);
  if (succeededUpdate.error) throw succeededUpdate.error;

  const aiInsert = await supabase.from('ai_tasks').insert({
    organization_id: organizationId,
    brand_id: brandId,
    strategy_id: strategyId,
    task_type: REPLAY_STRATEGY_TASK_TYPE,
    status: 'SUCCEEDED',
    provider: REPLAY_PROVIDER,
    model: REPLAY_MODEL,
    idempotency_key: `strategy:${strategyId}`,
    input_metadata: { replay: true, facts: inputSnapshot.facts, insights: inputSnapshot.insights, evidenceClaims: inputSnapshot.evidenceClaims, evidenceSources: inputSnapshot.sources, researchRunId },
    output_metadata: {
      replay: true,
      objectives: output.objectives.length,
      channels: output.channels.length,
      campaigns: output.campaigns.length,
      assumptions: output.assumptions.length,
      contentPillars: output.contentStrategy.contentPillars.length,
      seoTopics: output.seoStrategy.priorityTopics.length,
      researchRunId,
    },
    latency_ms: 0,
    started_at: now,
    finished_at: now,
  });
  if (aiInsert.error) throw aiInsert.error;

  if (userId) {
    await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      actor_user_id: userId,
      action: 'strategy.generated',
      entity_type: 'strategy',
      entity_id: strategyId,
      metadata: { replay: true, provider: REPLAY_PROVIDER, version: input.version, aiTaskStatus: 'SUCCEEDED' },
    });
  }

  obs.info('Replay strategy completed', { strategyId, brandId, organizationId, version: input.version });
  return { status: 'SUCCEEDED', version: input.version };
}

export async function regenerateReplaySuggestion(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; suggestionId: string },
): Promise<SuggestionDraft> {
  const { organizationId, brandId, suggestionId } = args;
  const now = new Date().toISOString();

  const { data: row, error } = await supabase
    .from('brand_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .eq('organization_id', organizationId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('SUGGESTION_NOT_FOUND');

  const { sourceIndex, urlTitles } = await sourceIndexes(supabase, { organizationId, brandId });
  const draft = fixtureDraftFor(row.field, sourceIndex, urlTitles);
  if (!draft) throw new Error('UNKNOWN_FIELD');

  const aiInsert = await supabase.from('ai_tasks').insert({
    organization_id: organizationId,
    brand_id: brandId,
    task_type: 'brand_field_regeneration',
    status: 'SUCCEEDED',
    provider: REPLAY_PROVIDER,
    model: REPLAY_MODEL,
    idempotency_key: `brain-field:${suggestionId}:${Date.now()}`,
    input_metadata: { field: row.field, replay: true },
    output_metadata: { field: row.field, found: draft.found, replay: true },
    latency_ms: 0,
    started_at: now,
    finished_at: now,
  });
  if (aiInsert.error) throw aiInsert.error;

  const history = [...(row.history ?? [])]
    .concat([{ at: row.updated_at, status: row.status, proposed_value: row.proposed_value, evidence: row.evidence }])
    .slice(-10);

  const { error: updateError } = await supabase
    .from('brand_suggestions')
    .update({
      proposed_value: draft.proposedValue,
      status: draft.found ? 'PENDING' : 'NOT_FOUND',
      evidence: draft.evidence,
      evidence_strength: draft.evidenceStrength,
      sources_examined: draft.sourcesExamined,
      confidence: draft.confidence,
      history,
      updated_at: now,
      reviewed_at: null,
      reviewed_by: null,
    })
    .eq('id', suggestionId)
    .eq('organization_id', organizationId);
  if (updateError) throw updateError;

  return draft;
}

export type ContentSample = {
  type: string;
  channel: string;
  headline: string;
  body: string;
  cta: string;
  rationale: string;
  strategyReferences: string[];
  brandFactReferences: string[];
};

export function fixtureContentSample(type: string, channel?: string): ContentSample {
  const matchChannel = fixture.content.samples.find((sample) => sample.type === type && sample.channel === (channel ?? sample.channel));
  const matchType = fixture.content.samples.find((sample) => sample.type === type);
  const sample = matchChannel ?? matchType ?? fixture.content.samples[0];
  if (!sample) throw new Error('REPLAY_CONTENT_FIXTURE_MISSING');
  return sample;
}

export type ReplayContentOutcome = {
  status: 'SUCCEEDED' | 'FAILED';
  version: number;
  errorCode?: string;
  errorMessage?: string;
};

export async function completeReplayContentGeneration(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    brandId: string;
    contentId: string;
    userId?: string | null;
    intent: Pick<ContentIntentLike, 'type' | 'channel' | 'title'>;
  },
): Promise<ReplayContentOutcome> {
  const { organizationId, brandId, contentId, userId, intent } = args;
  const now = new Date().toISOString();
  const sample = fixtureContentSample(intent.type, intent.channel);

  const versionsResult = await supabase
    .from('content_versions')
    .select('version')
    .eq('content_item_id', contentId)
    .eq('organization_id', organizationId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionsResult.error) throw versionsResult.error;
  const version = ((versionsResult.data?.version as number | undefined) ?? 0) + 1;

  const strategyResult = await supabase
    .from('strategies')
    .select('id')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .eq('status', 'SUCCEEDED')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (strategyResult.error) throw strategyResult.error;
  const strategyId = strategyResult.data?.id ?? null;

  const versionInsert = await supabase
    .from('content_versions')
    .insert({
      organization_id: organizationId,
      content_item_id: contentId,
      version,
      body: sample.body,
      headline: sample.headline,
      cta: sample.cta,
      strategy_id: strategyId,
      provider: REPLAY_PROVIDER,
      model: REPLAY_MODEL,
      author_user_id: userId ?? null,
      rationale: sample.rationale,
      brand_fact_references: sample.brandFactReferences,
      strategy_references: sample.strategyReferences,
      metadata: {
        formatted: true,
        content_type: intent.type,
        channel: intent.channel,
        intent: {},
        replay: true,
      },
    })
    .select('id')
    .single();
  if (versionInsert.error) throw versionInsert.error;
  const contentVersionId = versionInsert.data.id;

  const itemUpdate = await supabase
    .from('content_items')
    .update({ current_version_id: contentVersionId, updated_at: now })
    .eq('id', contentId)
    .eq('organization_id', organizationId);
  if (itemUpdate.error) throw itemUpdate.error;

  const aiInsert = await supabase.from('ai_tasks').insert({
    organization_id: organizationId,
    brand_id: brandId,
    content_item_id: contentId,
    strategy_id: strategyId,
    task_type: REPLAY_CONTENT_TASK_TYPE,
    status: 'SUCCEEDED',
    provider: REPLAY_PROVIDER,
    model: REPLAY_MODEL,
    idempotency_key: `content:${contentId}:${Date.now()}`,
    input_metadata: { replay: true, intentType: intent.type, intentChannel: intent.channel },
    output_metadata: {
      replay: true,
      version,
      contentVersionId,
      headline: sample.headline,
      bodyChars: sample.body.length,
    },
    latency_ms: 0,
    started_at: now,
    finished_at: now,
  });
  if (aiInsert.error) throw aiInsert.error;

  if (userId) {
    await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      actor_user_id: userId,
      action: 'content.generated',
      entity_type: 'content',
      entity_id: contentId,
      metadata: { replay: true, provider: REPLAY_PROVIDER, version, aiTaskStatus: 'SUCCEEDED' },
    });
  }

  obs.info('Replay content generation completed', { contentId, brandId, organizationId, version });
  return { status: 'SUCCEEDED', version };
}