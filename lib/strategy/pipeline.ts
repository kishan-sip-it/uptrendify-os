import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createDefaultRegistry } from '@/lib/ai/registry';
import { withTransientRetry } from '@/lib/ai/retry';
import type { AiProvider } from '@/lib/ai/types';
import { obs } from '@/lib/obs/logger';
import {
  buildStrategyTextContext,
  summarizeSnapshot,
  type BrainSnapshot,
  type StrategyEvidenceClaim,
  type StrategyFact,
  type StrategyInsight,
  type StrategySource,
} from './context';
import { extractStrategy, isStrategyValidationError } from './strategy';
import type { StrategyOutput } from './schema';
import { checkApprovalGate, GATE_MIN_APPROVED, type SuggestionRow } from '@/lib/brain/review';

export const STRATEGY_TASK_TYPE = 'strategy_generation';
export const STRATEGY_ACTIVE_STATUSES = ['QUEUED', 'RUNNING'] as const;
export type StrategyActiveStatus = (typeof STRATEGY_ACTIVE_STATUSES)[number];

export function gateMessage(rows: SuggestionRow[]): string {
  const { missing } = checkApprovalGate(rows);
  const approved = rows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED').length;
  const parts = [
    `Review and approve the Brand Brain suggestions first. Currently ${approved}/${GATE_MIN_APPROVED} required fields are approved, and ${missing.length} required field${missing.length === 1 ? '' : 's'} (${missing.join(', ')}) need approval.`,
  ];
  return parts.join(' ');
}

export type StrategyPipelineInput = {
  supabase: SupabaseClient;
  organizationId: string;
  brandId: string;
  strategyId: string;
  createdBy?: string | null;
};

export type StrategyPipelineDeps = {
  provider?: AiProvider | null;
};

export type StrategyOutcome = {
  status: 'SUCCEEDED' | 'FAILED';
  aiTaskId?: string;
  version?: number;
  provider?: string;
  model?: string;
  errorCode?: string;
  errorMessage?: string;
};

async function loadBrainSnapshot(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string },
): Promise<{ snapshot: BrainSnapshot; suggestionRows: SuggestionRow[] }> {
  const { organizationId, brandId } = args;

  const brandResult = await supabase
    .from('brands')
    .select('name,website_url,industry,market_country,target_audience')
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

  const suggestionsResult = await supabase
    .from('brand_suggestions')
    .select('id,field,label,proposed_value,status')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .order('field', { ascending: true });

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

  for (const result of [brandResult, factsResult, insightsResult, sourcesResult, runsResult, suggestionsResult]) {
    if (result.error) throw result.error;
  }

  const suggestionRows = (suggestionsResult.data ?? []) as SuggestionRow[];
  const approvedSuggestionRows = suggestionRows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED');

  const facts: StrategyFact[] = [
    ...approvedSuggestionRows.map((row) => ({ key: row.label || row.field, value: row.proposed_value })),
  ];
  const approvedSuggestionKeys = new Set(approvedSuggestionRows.map((row) => row.field));
  for (const row of ((factsResult.data ?? []) as Array<{ key: string; value: unknown }>)) {
    if (!approvedSuggestionKeys.has(row.key)) facts.push({ key: row.key, value: row.value });
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

  const sources: StrategySource[] = (sourcesResult.data ?? []).map((row: any) => ({
    url: row.canonical_url ?? row.url ?? '',
    title: row.title,
  })).filter((source: StrategySource) => Boolean(source.url));

  return {
    snapshot: {
      brand: {
        name: brandResult.data?.name ?? '',
        websiteUrl: brandResult.data?.website_url ?? null,
        industry: brandResult.data?.industry ?? null,
        marketCountry: brandResult.data?.market_country ?? null,
        targetAudience: brandResult.data?.target_audience ?? null,
      },
      facts,
      // AI-generated insights/evidence are analysis artifacts, not human-approved
      // truth. Keep them out of strategy-generation context.
      insights: [],
      evidenceClaims: [],
      sources,
      researchRunId: runsResult.data?.[0]?.id ?? null,
    },
    suggestionRows,
  };
}

async function failTask(
  supabase: SupabaseClient,
  args: { aiTaskId?: string; strategyId: string; organizationId: string; code: string; message: string },
): Promise<void> {
  const { aiTaskId, strategyId, organizationId, code, message } = args;
  const safeMessage = message?.slice(0, 600);
  if (aiTaskId) {
    await supabase.from('ai_tasks').update({
      status: 'FAILED',
      error_code: code,
      error_message: safeMessage,
      finished_at: new Date().toISOString(),
    }).eq('id', aiTaskId);
  }
  await supabase.from('strategies').update({
    status: 'FAILED',
    error_code: code,
    error_message: safeMessage,
    finished_at: new Date().toISOString(),
  }).eq('id', strategyId).eq('organization_id', organizationId);
  obs.info('Strategy generation marked failed', { strategyId, code });
}

export async function runStrategyGeneration(
  input: StrategyPipelineInput,
  deps: StrategyPipelineDeps = {},
): Promise<StrategyOutcome> {
  const { supabase, organizationId, brandId, strategyId, createdBy } = input;

  const strategyResult = await supabase
    .from('strategies')
    .select('id,version')
    .eq('id', strategyId)
    .eq('organization_id', organizationId)
    .single();
  if (strategyResult.error) throw strategyResult.error;
  const version = strategyResult.data?.version as number | undefined;

  const startedUpdate = await supabase
    .from('strategies')
    .update({ status: 'RUNNING', started_at: new Date().toISOString() })
    .eq('id', strategyId)
    .eq('organization_id', organizationId);
  if (startedUpdate.error) throw startedUpdate.error;

  const { snapshot, suggestionRows } = await loadBrainSnapshot(supabase, { organizationId, brandId });

  if (suggestionRows.length === 0) {
    await failTask(supabase, {
      strategyId,
      organizationId,
      code: 'INSUFFICIENT_BRAIN',
      message: 'Import the brand website and review the Brand Brain suggestions before building a strategy.',
    });
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
    await failTask(supabase, {
      strategyId,
      organizationId,
      code: 'INSUFFICIENT_BRAIN',
      message: 'Generate the Brand Brain first; there is not enough research data to build a strategy.',
    });
    return { status: 'FAILED', version, errorCode: 'INSUFFICIENT_BRAIN', errorMessage: 'Not enough Brand Brain data to build a strategy.' };
  }

  const contextText = buildStrategyTextContext(snapshot);
  const aiTaskInsert = await supabase.from('ai_tasks').insert({
    organization_id: organizationId,
    brand_id: brandId,
    strategy_id: strategyId,
    task_type: STRATEGY_TASK_TYPE,
    status: 'RUNNING',
    idempotency_key: `strategy:${strategyId}`,
    input_metadata: {
      facts: snapshot.facts.length,
      insights: snapshot.insights.length,
      evidenceClaims: snapshot.evidenceClaims.length,
      evidenceSources: snapshot.sources.length,
      contextChars: contextText.length,
      researchRunId: snapshot.researchRunId,
    },
    started_at: new Date().toISOString(),
  }).select('id').single();

  let aiTaskId: string;
  if (aiTaskInsert.error) {
    if (aiTaskInsert.error.code === '23505') {
      const existing = await supabase
        .from('ai_tasks')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('idempotency_key', `strategy:${strategyId}`)
        .maybeSingle();
      if (existing.error || !existing.data) throw aiTaskInsert.error;
      aiTaskId = existing.data.id;
    } else {
      throw aiTaskInsert.error;
    }
  } else {
    aiTaskId = aiTaskInsert.data.id;
  }

  const fail = (code: string, message: string) =>
    failTask(supabase, { aiTaskId, strategyId, organizationId, code, message });

  let provider: AiProvider | null = deps.provider !== undefined ? deps.provider : createDefaultRegistry().default();
  const providerId = provider?.id;
  if (!provider) {
    await fail('PROVIDER_UNCONFIGURED', 'No AI provider is configured.');
    return { status: 'FAILED', aiTaskId, version, errorCode: 'PROVIDER_UNCONFIGURED', errorMessage: 'No AI provider is configured.' };
  }

  const model = provider.defaultModel;
  const providerUpdate = await supabase.from('ai_tasks').update({
    provider: providerId,
    model,
  }).eq('id', aiTaskId);
  if (providerUpdate.error) throw providerUpdate.error;

  let result: StrategyOutput;
  let providerModel: string;
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  const startedAt = Date.now();

  try {
    const extraction = await withTransientRetry(() => extractStrategy(provider, contextText), {
      label: 'strategy generation',
      providerId,
    });
    result = extraction.result;
    providerModel = extraction.model;
    usage = extraction.usage;

    const persistUpdate = await supabase.from('strategies').update({
      status: 'SUCCEEDED',
      provider: providerId,
      model: providerModel,
      output: result,
      input_snapshot: {
        ...summarizeSnapshot(snapshot),
        contextChars: contextText.length,
      },
      finished_at: new Date().toISOString(),
    }).eq('id', strategyId).eq('organization_id', organizationId);
    if (persistUpdate.error) throw persistUpdate.error;

    const aiTaskUpdate = await supabase.from('ai_tasks').update({
      status: 'SUCCEEDED',
      provider: providerId,
      model: providerModel,
      output_metadata: {
        objectives: result.objectives.length,
        channels: result.channels.length,
        campaigns: result.campaigns.length,
        assumptions: result.assumptions.length,
        contentPillars: result.contentStrategy.contentPillars.length,
        seoTopics: result.seoStrategy.priorityTopics.length,
        researchRunId: snapshot.researchRunId,
      },
      latency_ms: Date.now() - startedAt,
      input_tokens: usage?.inputTokens,
      output_tokens: usage?.outputTokens,
      finished_at: new Date().toISOString(),
    }).eq('id', aiTaskId);
    if (aiTaskUpdate.error) throw aiTaskUpdate.error;

    if (createdBy) {
      await supabase.from('audit_logs').insert({
        organization_id: organizationId,
        actor_user_id: createdBy,
        action: 'strategy.generated',
        entity_type: 'strategy',
        entity_id: strategyId,
        metadata: { version, provider: providerId, model: providerModel, aiTaskId },
      });
    }

    obs.info('Strategy generated', {
      strategyId, brandId, organizationId,
      version, provider: providerId, model: providerModel,
      objectives: result.objectives.length,
    });

    return {
      status: 'SUCCEEDED',
      aiTaskId,
      version,
      provider: providerId,
      model: providerModel,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = isStrategyValidationError(error) ? 'STRATEGY_VALIDATION_FAILED' : 'AI_GENERATION_FAILED';
    obs.error('Strategy generation failed', {
      strategyId, brandId, organizationId,
      provider: providerId, model, error: message,
    });
    await fail(code, message);
    return { status: 'FAILED', aiTaskId, version, provider: providerId, model, errorCode: code, errorMessage: message };
  }
}

export function scheduleStrategyExecution(input: StrategyPipelineInput): void {
  after(() => {
    runStrategyGeneration(input).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      obs.error('Strategy pipeline failed', { strategyId: input.strategyId, brandId: input.brandId, error: message });
      try {
        await input.supabase
          .from('strategies')
          .update({
            status: 'FAILED',
            finished_at: new Date().toISOString(),
            error_code: 'PIPELINE_FAILED',
            error_message: 'Strategy pipeline failed',
          })
          .eq('id', input.strategyId)
          .eq('organization_id', input.organizationId);
      } catch (markError) {
        obs.error('Failed to mark strategy failed', {
          strategyId: input.strategyId,
          error: markError instanceof Error ? markError.message : String(markError),
        });
      }
    });
  });
}