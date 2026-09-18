import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createDefaultRegistry } from '@/lib/ai/registry';
import { withTransientRetry } from '@/lib/ai/retry';
import { classifyProviderFailure } from '@/lib/ai/classify';
import type { AiProvider } from '@/lib/ai/types';
import { obs } from '@/lib/obs/logger';
import { loadContentSnapshot, evaluateContentGate, toContentBrainContext } from './context';
import { buildContentPrompt, buildContentRepairPrompt } from './prompt';
import { extractContent, isContentValidationError } from './generate';
import type { ContentGeneration, ContentIntentLike } from './schema';

export const CONTENT_TASK_TYPE = 'content_generation';

export type ContentPipelineInput = {
  supabase: SupabaseClient;
  organizationId: string;
  brandId: string;
  contentId: string;
  intent: ContentIntentLike;
  createdBy?: string | null;
};

export type ContentPipelineDeps = {
  provider?: AiProvider | null;
};

export type ContentGenerationOutcome = {
  status: 'SUCCEEDED' | 'FAILED';
  aiTaskId?: string;
  version?: number;
  provider?: string;
  model?: string;
  errorCode?: string;
  errorMessage?: string;
};

async function loadNextVersion(supabase: SupabaseClient, args: { organizationId: string; contentId: string }): Promise<number> {
  const { data, error } = await supabase
    .from('content_versions')
    .select('version')
    .eq('content_item_id', args.contentId)
    .eq('organization_id', args.organizationId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return ((data?.version as number | undefined) ?? 0) + 1;
}

async function insertVersion(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{ id: string; version: number } | null> {
  const inserted = await supabase.from('content_versions').insert(row).select('id,version').single();
  if (!inserted.error) return inserted.data as { id: string; version: number };
  if (inserted.error.code !== '23505') throw inserted.error;
  return null;
}

async function recordFailure(
  supabase: SupabaseClient,
  args: {
    aiTaskId?: string;
    contentId: string;
    organizationId: string;
    code: string;
    message: string;
    provider?: string;
    model?: string;
  },
): Promise<void> {
  const { aiTaskId, contentId, organizationId, code, message, provider, model } = args;
  const safeMessage = message?.slice(0, 600);
  if (aiTaskId) {
    await supabase
      .from('ai_tasks')
      .update({
        status: 'FAILED',
        provider: provider ?? null,
        model: model ?? null,
        error_code: code,
        error_message: safeMessage,
        finished_at: new Date().toISOString(),
      })
      .eq('id', aiTaskId);
  }
  obs.warn('Content generation marked failed', { contentId, code });
}

export async function runContentGeneration(
  input: ContentPipelineInput,
  deps: ContentPipelineDeps = {},
): Promise<ContentGenerationOutcome> {
  const { supabase, organizationId, brandId, contentId, createdBy } = input;
  const intent = input.intent;

  const itemResult = await supabase
    .from('content_items')
    .select('id,title,type,channel')
    .eq('id', contentId)
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (itemResult.error) throw itemResult.error;
  if (!itemResult.data) throw new Error('CONTENT_NOT_FOUND');

  const snapshot = await loadContentSnapshot(supabase, { organizationId, brandId });
  const gate = evaluateContentGate(snapshot);
  if (!gate.ok || !snapshot.strategy) {
    await recordFailure(supabase, {
      contentId,
      organizationId,
      code: gate.code ?? 'CONTENT_GATE_BLOCKED',
      message: gate.message,
    });
    return {
      status: 'FAILED',
      version: undefined,
      errorCode: gate.code ?? 'CONTENT_GATE_BLOCKED',
      errorMessage: gate.message,
    };
  }

  const strategy = snapshot.strategy;
  const aiTaskInsert = await supabase
    .from('ai_tasks')
    .insert({
      organization_id: organizationId,
      brand_id: brandId,
      content_item_id: contentId,
      strategy_id: strategy.id,
      task_type: CONTENT_TASK_TYPE,
      status: 'RUNNING',
      idempotency_key: `content:${contentId}:${Date.now()}`,
      input_metadata: {
        intentType: intent.type,
        intentChannel: intent.channel,
        facts: snapshot.facts.length,
        insights: snapshot.insights.length,
        evidenceClaims: snapshot.evidenceClaims.length,
        researchRunId: snapshot.researchRunId,
      },
      started_at: new Date().toISOString(),
      ...(createdBy ? { created_by: createdBy } : {}),
    })
    .select('id')
    .single();
  if (aiTaskInsert.error) throw aiTaskInsert.error;
  const aiTaskId = aiTaskInsert.data.id;

  const fail = (code: string, message: string, provider?: string, model?: string) =>
    recordFailure(supabase, { aiTaskId, contentId, organizationId, code, message, provider, model });

  let provider: AiProvider | null = deps.provider !== undefined ? deps.provider : createDefaultRegistry().default();
  const providerId = provider?.id;
  if (!provider) {
    await fail('PROVIDER_UNCONFIGURED', 'No AI provider is configured.');
    return { status: 'FAILED', aiTaskId, errorCode: 'PROVIDER_UNCONFIGURED', errorMessage: 'No AI provider is configured.' };
  }

  const model = provider.defaultModel;
  const providerUpdate = await supabase.from('ai_tasks').update({ provider: providerId, model }).eq('id', aiTaskId);
  if (providerUpdate.error) throw providerUpdate.error;

  const prompt = buildContentPrompt(toContentBrainContext(snapshot), strategy, intent);
  const startedAt = Date.now();

  try {
    const extraction = await withTransientRetry(() => extractContent(provider, prompt, intent, { promptForRepair: buildContentRepairPrompt }), {
      label: 'content generation',
      providerId,
    });
    const result = extraction.result as ContentGeneration;
    const providerModel = extraction.model;

    const nextVersion = await loadNextVersion(supabase, { organizationId, contentId });
    const versionRow = {
      organization_id: organizationId,
      content_item_id: contentId,
      version: nextVersion,
      body: result.body,
      headline: result.headline,
      cta: result.cta ?? null,
      strategy_id: strategy.id,
      provider: providerId,
      model: providerModel,
      author_user_id: createdBy ?? null,
      rationale: result.rationale ?? null,
      brand_fact_references: result.brand_fact_references ?? [],
      strategy_references: result.strategy_references ?? [],
      metadata: {
        formatted: true,
        content_type: intent.type,
        channel: intent.channel,
        intent: {
          objective: intent.objective ?? null,
          audience: intent.audience ?? null,
          context: intent.context ?? null,
          tone: intent.tone ?? null,
          ctaDirection: intent.cta ?? null,
          instructions: intent.instructions ?? null,
        },
      },
    };

    let persisted: { id: string; version: number } | null = null;
    for (let attempt = 0; attempt < 3 && !persisted; attempt += 1) {
      persisted = await insertVersion(supabase, versionRow);
      if (!persisted) {
        const retried = await loadNextVersion(supabase, { organizationId, contentId });
        versionRow.version = retried;
      }
    }
    if (!persisted) throw new Error('Could not persist content version after retries');

    const itemUpdate = await supabase
      .from('content_items')
      .update({ current_version_id: persisted.id, updated_at: new Date().toISOString() })
      .eq('id', contentId)
      .eq('organization_id', organizationId);
    if (itemUpdate.error) throw itemUpdate.error;

    const aiTaskUpdate = await supabase
      .from('ai_tasks')
      .update({
        status: 'SUCCEEDED',
        provider: providerId,
        model: providerModel,
        output_metadata: {
          version: persisted.version,
          contentVersionId: persisted.id,
          headline: result.headline,
          bodyChars: result.body.length,
          factsReferenced: result.brand_fact_references?.length ?? 0,
          strategyReferenced: result.strategy_references?.length ?? 0,
          researchRunId: snapshot.researchRunId,
        },
        latency_ms: Date.now() - startedAt,
        input_tokens: extraction.usage?.inputTokens,
        output_tokens: extraction.usage?.outputTokens,
        finished_at: new Date().toISOString(),
      })
      .eq('id', aiTaskId);
    if (aiTaskUpdate.error) throw aiTaskUpdate.error;

    if (createdBy) {
      await supabase.from('audit_logs').insert({
        organization_id: organizationId,
        actor_user_id: createdBy,
        action: 'content.generated',
        entity_type: 'content',
        entity_id: contentId,
        metadata: { version: persisted.version, provider: providerId, model: providerModel, aiTaskId },
      });
    }

    obs.info('Content generated', { contentId, brandId, organizationId, version: persisted.version, provider: providerId, model: providerModel });

    return {
      status: 'SUCCEEDED',
      aiTaskId,
      version: persisted.version,
      provider: providerId,
      model: providerModel,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const classification = classifyProviderFailure(error);
    const code = isContentValidationError(error)
      ? 'CONTENT_VALIDATION_FAILED'
      : classification.code === 'UNKNOWN'
        ? 'AI_GENERATION_FAILED'
        : classification.code;
    obs.error('Content generation failed', {
      contentId,
      brandId,
      organizationId,
      provider: providerId,
      model,
      error: message,
    });
    await fail(code, message, providerId, model);
    return { status: 'FAILED', aiTaskId, provider: providerId, model, errorCode: code, errorMessage: message };
  }
}

export function scheduleContentExecution(input: ContentPipelineInput): void {
  after(() => {
    runContentGeneration(input).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      obs.error('Content pipeline failed', { contentId: input.contentId, brandId: input.brandId, error: message });
      try {
        await input.supabase
          .from('content_items')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', input.contentId)
          .eq('organization_id', input.organizationId);
      } catch (markError) {
        obs.error('Failed to touch content item after pipeline failure', {
          contentId: input.contentId,
          error: markError instanceof Error ? markError.message : String(markError),
        });
      }
    });
  });
}