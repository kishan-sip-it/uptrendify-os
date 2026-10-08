import type { SupabaseClient } from '@supabase/supabase-js';
import { createDefaultRegistry, runWithProviderFailover } from '@/lib/ai/registry';
import { withTransientRetry } from '@/lib/ai/retry';
import { classifyProviderFailure } from '@/lib/ai/classify';
import type { AiProvider } from '@/lib/ai/types';
import { obs } from '@/lib/obs/logger';
import { buildStrategyTextContext, summarizeSnapshot, type BrainSnapshot, type StrategyEvidenceClaim, type StrategyFact, type StrategyInsight, type StrategySource } from './context';
import { extractStrategy, isStrategyValidationError } from './strategy';
import type { StrategyOutput } from './schema';
import { checkApprovalGate, GATE_MIN_APPROVED, type SuggestionRow } from '@/lib/brain/review';

export const STRATEGY_TASK_TYPE = 'strategy_generation';
export const STRATEGY_ACTIVE_STATUSES = ['QUEUED', 'RUNNING'] as const;
export const STRATEGY_GENERATION_LIMIT = 3;
export const STRATEGY_STALE_AFTER_MS = 5 * 60 * 1000;
export type StrategyActiveStatus = (typeof STRATEGY_ACTIVE_STATUSES)[number];

export function gateMessage(rows: SuggestionRow[]): string {
  const { missing } = checkApprovalGate(rows);
  const approved = rows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED').length;
  const approvalProgress = `${approved}/${GATE_MIN_APPROVED} approvals complete`;
  if (missing.length > 0) return `Review the Brand Brain suggestions first. ${approvalProgress}. Brand field${missing.length === 1 ? '' : 's'} still needing approval: ${missing.join(', ')}.`;
  if (approved < GATE_MIN_APPROVED) return `Review the Brand Brain suggestions first. ${approvalProgress} (${approved} approved or edited). Approve or edit ${GATE_MIN_APPROVED - approved} more suggestion${GATE_MIN_APPROVED - approved === 1 ? '' : 's'} before generating strategy.`;
  return 'Brand Brain approval gate is ready for strategy generation.';
}

export type StrategyPipelineInput = { supabase: SupabaseClient; organizationId: string; brandId: string; strategyId: string; createdBy?: string | null };
export type StrategyPipelineDeps = { provider?: AiProvider | null };
export type StrategyOutcome = { status: 'SUCCEEDED' | 'FAILED'; aiTaskId?: string; version?: number; provider?: string; model?: string; errorCode?: string; errorMessage?: string };

async function loadBrainSnapshot(supabase: SupabaseClient, args: { organizationId: string; brandId: string }): Promise<{ snapshot: BrainSnapshot; suggestionRows: SuggestionRow[] }> {
  const { organizationId, brandId } = args;
  const brandResult = await supabase.from('brands').select('name,website_url,industry,market_country,target_audience,primary_color,secondary_colors,brand_rules,audience_details,offer_details,positioning,messaging,visual_identity').eq('id', brandId).eq('organization_id', organizationId).maybeSingle();
  const factsResult = await supabase.from('brand_facts').select('key,value').eq('brand_id', brandId).eq('organization_id', organizationId).eq('approved', true).order('key', { ascending: true }).limit(40);
  const suggestionsResult = await supabase.from('brand_suggestions').select('id,field,label,proposed_value,status').eq('brand_id', brandId).eq('organization_id', organizationId).order('field', { ascending: true });
  const insightsResult = await supabase.from('brand_insights').select('category,title,description,priority,metadata').eq('brand_id', brandId).eq('organization_id', organizationId).order('priority', { ascending: true }).order('created_at', { ascending: false }).limit(80);
  const sourcesResult = await supabase.from('brand_sources').select('url,canonical_url,title').eq('brand_id', brandId).eq('organization_id', organizationId).order('retrieved_at', { ascending: false }).limit(20);
  const runsResult = await supabase.from('research_runs').select('id').eq('brand_id', brandId).eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(1);
  for (const result of [brandResult, factsResult, insightsResult, sourcesResult, runsResult, suggestionsResult]) if (result.error) throw result.error;

  const suggestionRows = (suggestionsResult.data ?? []) as SuggestionRow[];
  const approvedSuggestionRows = suggestionRows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED');
  const facts: StrategyFact[] = [...approvedSuggestionRows.map((row) => ({ key: row.label || row.field, value: row.proposed_value }))];
  const approvedSuggestionKeys = new Set(approvedSuggestionRows.map((row) => row.field));
  for (const row of ((factsResult.data ?? []) as Array<{ key: string; value: unknown }>)) if (!approvedSuggestionKeys.has(row.key)) facts.push({ key: row.key, value: row.value });

  const insightRows = (insightsResult.data ?? []) as Array<{ category: string; title: string; description: string | null; priority: number; metadata: { claimUrl?: string | null } | null }>;
  const insights: StrategyInsight[] = insightRows.map((row) => ({ category: row.category, title: row.title, description: row.description, priority: row.priority }));
  const evidenceClaims: StrategyEvidenceClaim[] = insightRows.filter((row) => row.category === 'EVIDENCE').map((row) => ({ claim: row.description ?? row.title, sourceUrl: row.metadata?.claimUrl ?? null }));
  const sources: StrategySource[] = (sourcesResult.data ?? []).map((row: any) => ({ url: row.canonical_url ?? row.url ?? '', title: row.title })).filter((source: StrategySource) => Boolean(source.url));

  return {
    snapshot: {
      brand: {
        name: brandResult.data?.name ?? '',
        websiteUrl: brandResult.data?.website_url ?? null,
        industry: brandResult.data?.industry ?? null,
        marketCountry: brandResult.data?.market_country ?? null,
        targetAudience: brandResult.data?.target_audience ?? null,
        primaryColor: brandResult.data?.primary_color ?? null,
        secondaryColors: Array.isArray(brandResult.data?.secondary_colors) ? brandResult.data.secondary_colors : [],
        brandRules: (brandResult.data?.brand_rules ?? {}) as Record<string, unknown>,
        audienceDetails: (brandResult.data?.audience_details ?? {}) as Record<string, unknown>,
        offerDetails: (brandResult.data?.offer_details ?? {}) as Record<string, unknown>,
        positioning: (brandResult.data?.positioning ?? {}) as Record<string, unknown>,
        messaging: (brandResult.data?.messaging ?? {}) as Record<string, unknown>,
        visualIdentity: (brandResult.data?.visual_identity ?? {}) as Record<string, unknown>,
      },
      facts,
      insights,
      evidenceClaims,
      sources,
      researchRunId: runsResult.data?.[0]?.id ?? null,
    },
    suggestionRows,
  };
}

async function failTask(supabase: SupabaseClient, args: { aiTaskId?: string; strategyId: string; organizationId: string; code: string; message: string }): Promise<void> {
  const safeMessage = args.message?.slice(0, 600);
  if (args.aiTaskId) await supabase.from('ai_tasks').update({ status: 'FAILED', error_code: args.code, error_message: safeMessage, finished_at: new Date().toISOString() }).eq('id', args.aiTaskId);
  await supabase.from('strategies').update({ status: 'FAILED', error_code: args.code, error_message: safeMessage, finished_at: new Date().toISOString() }).eq('id', args.strategyId).eq('organization_id', args.organizationId);
  obs.info('Strategy generation marked failed', { strategyId: args.strategyId, code: args.code });
}

export async function recoverStaleStrategyExecution(supabase: SupabaseClient, args: { organizationId: string; brandId: string }): Promise<void> {
  const cutoff = new Date(Date.now() - STRATEGY_STALE_AFTER_MS).toISOString();
  const [runningResult, queuedResult] = await Promise.all([
    supabase.from('strategies').select('id').eq('organization_id', args.organizationId).eq('brand_id', args.brandId).eq('status', 'RUNNING').lt('started_at', cutoff).limit(20),
    supabase.from('strategies').select('id').eq('organization_id', args.organizationId).eq('brand_id', args.brandId).eq('status', 'QUEUED').lt('created_at', cutoff).limit(20),
  ]);
  if (runningResult.error) throw runningResult.error;
  if (queuedResult.error) throw queuedResult.error;
  const stale = [...(runningResult.data ?? []), ...(queuedResult.data ?? [])];
  if (stale.length === 0) return;
  const finishedAt = new Date().toISOString();
  for (const strategy of stale) {
    const update = await supabase.from('strategies').update({ status: 'FAILED', error_code: 'GENERATION_TIMEOUT', error_message: 'Strategy generation timed out and was recovered. Please retry generation.', finished_at: finishedAt }).eq('id', strategy.id).eq('organization_id', args.organizationId).in('status', [...STRATEGY_ACTIVE_STATUSES]);
    if (update.error) throw update.error;
    const taskUpdate = await supabase.from('ai_tasks').update({ status: 'FAILED', error_code: 'GENERATION_TIMEOUT', error_message: 'Strategy generation timed out and was recovered.', finished_at: finishedAt }).eq('organization_id', args.organizationId).eq('strategy_id', strategy.id).in('status', ['QUEUED', 'RUNNING']);
    if (taskUpdate.error) throw taskUpdate.error;
    obs.info('Recovered stale strategy generation', { strategyId: strategy.id, organizationId: args.organizationId, brandId: args.brandId });
  }
}

export async function runStrategyGeneration(input: StrategyPipelineInput, deps: StrategyPipelineDeps = {}): Promise<StrategyOutcome> {
  const { supabase, organizationId, brandId, strategyId, createdBy } = input;
  const strategyResult = await supabase.from('strategies').select('id,version').eq('id', strategyId).eq('organization_id', organizationId).single();
  if (strategyResult.error) throw strategyResult.error;
  const version = strategyResult.data?.version as number | undefined;
  const startedUpdate = await supabase.from('strategies').update({ status: 'RUNNING', started_at: new Date().toISOString() }).eq('id', strategyId).eq('organization_id', organizationId);
  if (startedUpdate.error) throw startedUpdate.error;

  const { snapshot, suggestionRows } = await loadBrainSnapshot(supabase, { organizationId, brandId });
  if (suggestionRows.length === 0) {
    await failTask(supabase, { strategyId, organizationId, code: 'INSUFFICIENT_BRAIN', message: 'Import the brand website and review the Brand Brain suggestions before building a strategy.' });
    return { status: 'FAILED', version, errorCode: 'INSUFFICIENT_BRAIN', errorMessage: 'Import the brand website first.' };
  }
  const gate = checkApprovalGate(suggestionRows);
  if (!gate.ok) {
    const message = gateMessage(suggestionRows);
    await failTask(supabase, { strategyId, organizationId, code: 'INSUFFICIENT_APPROVED_BRAIN', message });
    return { status: 'FAILED', version, errorCode: 'INSUFFICIENT_APPROVED_BRAIN', errorMessage: message };
  }
  const hasContext = snapshot.facts.length > 0 || snapshot.insights.length > 0 || snapshot.evidenceClaims.length > 0;
  if (!hasContext) {
    await failTask(supabase, { strategyId, organizationId, code: 'INSUFFICIENT_BRAIN', message: 'Generate the Brand Brain first; there is not enough research data to build a strategy.' });
    return { status: 'FAILED', version, errorCode: 'INSUFFICIENT_BRAIN', errorMessage: 'Not enough Brand Brain data to build a strategy.' };
  }

  const contextText = buildStrategyTextContext(snapshot);
  const aiTaskInsert = await supabase.from('ai_tasks').insert({ organization_id: organizationId, brand_id: brandId, strategy_id: strategyId, task_type: STRATEGY_TASK_TYPE, status: 'RUNNING', idempotency_key: `strategy:${strategyId}`, input_metadata: { facts: snapshot.facts.length, insights: snapshot.insights.length, evidenceClaims: snapshot.evidenceClaims.length, evidenceSources: snapshot.sources.length, contextChars: contextText.length, researchRunId: snapshot.researchRunId }, started_at: new Date().toISOString() }).select('id').single();

  let aiTaskId: string;
  if (aiTaskInsert.error) {
    if (aiTaskInsert.error.code === '23505') {
      const existing = await supabase.from('ai_tasks').select('id').eq('organization_id', organizationId).eq('idempotency_key', `strategy:${strategyId}`).maybeSingle();
      if (existing.error || !existing.data) throw aiTaskInsert.error;
      aiTaskId = existing.data.id;
    } else throw aiTaskInsert.error;
  } else aiTaskId = aiTaskInsert.data.id;

  const fail = (code: string, message: string) => failTask(supabase, { aiTaskId, strategyId, organizationId, code, message });
  const registry = deps.provider === undefined ? createDefaultRegistry() : null;
  const providers = deps.provider !== undefined
    ? (deps.provider ? [deps.provider] : [])
    : (registry?.configuredInOrder() ?? []);

  if (providers.length === 0) {
    await fail('PROVIDER_UNCONFIGURED', 'No AI provider is configured.');
    return { status: 'FAILED', aiTaskId, version, errorCode: 'PROVIDER_UNCONFIGURED', errorMessage: 'No AI provider is configured.' };
  }

  let provider = providers[0]!;
  let model = provider.defaultModel;



  let result: StrategyOutput;
  let providerModel: string;
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  const startedAt = Date.now();
  try {
    const extractionRun = await runWithProviderFailover(
      providers,
      async (candidate) => {
        provider = candidate;
        model = candidate.defaultModel;
        const providerUpdate = await supabase.from('ai_tasks').update({ provider: candidate.id, model: candidate.defaultModel }).eq('id', aiTaskId);
        if (providerUpdate.error) throw providerUpdate.error;
        return withTransientRetry(() => extractStrategy(candidate, contextText), { label: 'strategy generation', providerId: candidate.id });
      },
      async (failed, next, error) => {
        obs.warn('Failing over strategy generation to next AI provider', {
          strategyId,
          brandId,
          organizationId,
          failedProvider: failed.id,
          nextProvider: next.id,
          error: error instanceof Error ? error.message.slice(0, 300) : String(error),
        });
      },
    );
    provider = extractionRun.provider;
    model = extractionRun.provider.defaultModel;
    const extraction = extractionRun.result;
    const providerId = extractionRun.provider.id;
    result = extraction.result; providerModel = extraction.model; usage = extraction.usage;
    const persistUpdate = await supabase.from('strategies').update({ status: 'SUCCEEDED', provider: providerId, model: providerModel, output: result, input_snapshot: { ...summarizeSnapshot(snapshot), contextChars: contextText.length }, finished_at: new Date().toISOString() }).eq('id', strategyId).eq('organization_id', organizationId);
    if (persistUpdate.error) throw persistUpdate.error;
    const aiTaskUpdate = await supabase.from('ai_tasks').update({ status: 'SUCCEEDED', provider: providerId, model: providerModel, output_metadata: { objectives: result.objectives.length, channels: result.channels.length, campaigns: result.campaigns.length, assumptions: result.assumptions.length, contentPillars: result.contentStrategy.contentPillars.length, seoTopics: result.seoStrategy.priorityTopics.length, researchRunId: snapshot.researchRunId }, latency_ms: Date.now() - startedAt, input_tokens: usage?.inputTokens, output_tokens: usage?.outputTokens, finished_at: new Date().toISOString() }).eq('id', aiTaskId);
    if (aiTaskUpdate.error) throw aiTaskUpdate.error;
    if (createdBy) await supabase.from('audit_logs').insert({ organization_id: organizationId, actor_user_id: createdBy, action: 'strategy.generated', entity_type: 'strategy', entity_id: strategyId, metadata: { version, provider: providerId, model: providerModel, aiTaskId } });
    obs.info('Strategy generated', { strategyId, brandId, organizationId, version, provider: providerId, model: providerModel, objectives: result.objectives.length });
    return { status: 'SUCCEEDED', aiTaskId, version, provider: providerId, model: providerModel };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const classified = classifyProviderFailure(error);
    const code = isStrategyValidationError(error) ? 'VALIDATION_ERROR' : classified.code;
    obs.error('Strategy generation failed', { strategyId, brandId, organizationId, provider: provider.id, model, error: message });
    await fail(code, message);
    return { status: 'FAILED', aiTaskId, version, provider: provider.id, model, errorCode: code, errorMessage: message };
  }
}

export async function scheduleStrategyExecution(input: StrategyPipelineInput): Promise<StrategyOutcome> {
  try {
    return await runStrategyGeneration(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    obs.error('Strategy pipeline failed', { strategyId: input.strategyId, brandId: input.brandId, error: message });
    try {
      await input.supabase.from('strategies').update({ status: 'FAILED', finished_at: new Date().toISOString(), error_code: 'PIPELINE_FAILED', error_message: 'Strategy pipeline failed' }).eq('id', input.strategyId).eq('organization_id', input.organizationId).in('status', [...STRATEGY_ACTIVE_STATUSES]);
    } catch (markError) {
      obs.error('Failed to mark strategy failed', { strategyId: input.strategyId, error: markError instanceof Error ? markError.message : String(markError) });
    }
    return { status: 'FAILED', errorCode: 'PIPELINE_FAILED', errorMessage: 'Strategy generation failed. Please retry.' };
  }
}
