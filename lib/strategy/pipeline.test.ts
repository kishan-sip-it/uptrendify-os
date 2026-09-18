import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiProvider } from '@/lib/ai/types';
import { AiProviderError } from '@/lib/ai/types';
import { runStrategyGeneration } from './pipeline';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const STRATEGY_ID = '00000000-0000-4000-8000-000000000004';
const RUN_ID = '00000000-0000-4000-8000-000000000005';
const AI_TASK_ID = '00000000-0000-4000-8000-000000000006';

function makeClient(queues: Record<string, unknown[]>) {
  const store: Record<string, (() => unknown)[] | undefined> = {};
  for (const table of Object.keys(queues)) {
    const pending = [...queues[table]];
    store[table] = pending.map((item) => () => item);
  }

  const chain = (table: string) => {
    const execute = () => {
      const next = store[table]?.shift();
      if (next) return Promise.resolve(next());
      return Promise.resolve({ data: null, error: { message: `No mock result queued for ${table}` } });
    };
    const thenable: PromiseLike<unknown> = { then: (onFul) => execute().then(onFul) };
    const proxy = new Proxy(thenable, {
      get(target, prop) {
        if (prop in target || prop === 'then' || prop === 'catch') return Reflect.get(target, prop);
        const name = String(prop);
        if (name === 'maybeSingle') return async () => execute();
        if (name === 'single') {
          return async () => {
            const value = (await execute()) as any;
            return { data: Array.isArray(value?.data) ? value.data[0] : value?.data ?? null, error: value?.error ?? null };
          };
        }
        return () => chain(table);
      },
    });
    return proxy;
  };

  const from = vi.fn((table: string) => chain(String(table)));
  return { from } as unknown as { from: ReturnType<typeof vi.fn> } & SupabaseClient;
}

function objective(seed: number) {
  return { objective: `Objective ${seed}`, rationale: `Why ${seed}`, successMetric: `Metric ${seed}`, timeHorizon: '90 days' };
}

function validStrategyText() {
  return JSON.stringify({
    executiveSummary: { summary: 'A focused go-to-market strategy.', currentSituation: null, strategicDirection: null },
    businessUnderstanding: { whatCompanySells: 'Dev tooling', targetAudience: 'SaaS teams', problemsSolved: ['Slow shipping'], valueProposition: null, differentiators: ['Speed'], evidenceBasis: [] },
    objectives: [objective(1), objective(2), objective(3)],
    icp: { primaryAudience: 'CTO', secondaryAudience: null, painPoints: [], motivations: [], buyingTriggers: [], objections: [] },
    positioning: { positioningStatement: null, corePromise: null, differentiators: [], proofPoints: [], gaps: [], uncertainties: [] },
    messaging: { coreMessage: null, supportingMessages: [], valuePropositions: [], ctaDirections: [], toneOfVoice: null },
    contentStrategy: { contentPillars: [], topicClusters: [], educationalThemes: [], conversionThemes: [], trustThemes: [], contentFormats: [] },
    seoStrategy: { keywordOpportunities: [], searchIntentCategories: [], priorityTopics: [], onPageOpportunities: [], internalLinkingOpportunities: [], gaps: [] },
    channels: [],
    campaigns: [],
    roadmap: { days1To30: [], days31To60: [], days61To90: [] },
    kpis: { awareness: [], traffic: [], seo: [], engagement: [], leadsAndConversions: [], revenue: [] },
    risksAndGaps: { missingInformation: [], evidenceLimitations: [], strategicRisks: [], dependencies: [] },
    assumptions: [],
  });
}

function fakeProvider(generate: (input: { prompt: string }) => Promise<unknown>): AiProvider {
  return {
    id: 'fake',
    defaultModel: 'fake-model',
    configured: () => true,
    generate: generate as never,
    health: async () => ({ id: 'fake', ok: true, configured: true }),
  };
}

function approvedSuggestion(field: string, label: string, value: unknown) {
  return { id: `suggestion-${field}`, field, label, proposed_value: value, status: 'APPROVED' as const };
}

const approvedSuggestionRows = () => [
  approvedSuggestion('brand_name', 'Brand name', 'Aurora'),
  approvedSuggestion('brand_description', 'What the company does', 'B2B SaaS for growth teams'),
  approvedSuggestion('industry', 'Industry', 'B2B SaaS'),
  approvedSuggestion('business_model', 'Business model', 'Subscription'),
  approvedSuggestion('products_services', 'Products & services', ['Aurora Analytics']),
  approvedSuggestion('differentiators', 'Differentiators', ['Real-time dashboards']),
];

const successQueues = () => ({
  strategies: [
    { data: { id: STRATEGY_ID, version: 1 }, error: null },
    { error: null },
    { error: null },
  ],
  brands: [{ data: { name: 'Aurora', website_url: 'https://aurora.dev', industry: 'B2B SaaS', market_country: 'US', target_audience: 'Growth teams' }, error: null }],
  brand_facts: [{ data: [], error: null }],
  brand_suggestions: [{ data: approvedSuggestionRows(), error: null }],
  brand_insights: [{ data: [{ category: 'POSITIONING', title: 'Differentiator', description: 'Evidence-first workflow', priority: 1, metadata: null }], error: null }],
  brand_sources: [{ data: [{ url: 'https://aurora.dev/', canonical_url: null, title: 'Aurora Home' }], error: null }],
  research_runs: [{ data: [{ id: RUN_ID }], error: null }],
  ai_tasks: [
    { data: { id: AI_TASK_ID }, error: null },
    { error: null },
    { error: null },
  ],
  audit_logs: [{ error: null }],
});

describe('runStrategyGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists a SUCCEEDED strategy and AI task, and writes an audit log', async () => {
    const client = makeClient(successQueues());
    const generate = vi.fn().mockResolvedValue({ text: validStrategyText(), model: 'fake-model', usage: { outputTokens: 200 } });

    const outcome = await runStrategyGeneration(
      { supabase: client, organizationId: ORG_ID, brandId: BRAND_ID, strategyId: STRATEGY_ID, createdBy: USER_ID },
      { provider: fakeProvider(generate) },
    );

    expect(outcome).toMatchObject({ status: 'SUCCEEDED', aiTaskId: AI_TASK_ID, version: 1, provider: 'fake', model: 'fake-model' });

    const calls = client.from.mock.calls.map((call) => call[0]);
    expect(calls).toContain('strategies');
    expect(calls).toContain('ai_tasks');
    expect(calls).toContain('audit_logs');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('retries transient provider errors before succeeding', async () => {
    const client = makeClient(successQueues());
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new AiProviderError('fake', 'upstream 503', 503))
      .mockRejectedValueOnce(new AiProviderError('fake', 'upstream 503', 503))
      .mockResolvedValue({ text: validStrategyText(), model: 'fake-model' });

    const outcome = await runStrategyGeneration(
      { supabase: client, organizationId: ORG_ID, brandId: BRAND_ID, strategyId: STRATEGY_ID },
      { provider: fakeProvider(generate) },
    );

    expect(outcome.status).toBe('SUCCEEDED');
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it('marks the strategy and task FAILED when the strategy fails validation', async () => {
    const bad = JSON.parse(validStrategyText());
    bad.objectives = [objective(1)];
    const client = makeClient({
      strategies: [
        { data: { id: STRATEGY_ID, version: 1 }, error: null },
        { error: null },
        { error: null },
      ],
      brands: [{ data: { name: 'Aurora', website_url: 'https://aurora.dev', industry: null, market_country: null, target_audience: null }, error: null }],
      brand_facts: [{ data: [], error: null }],
      brand_suggestions: [{ data: approvedSuggestionRows(), error: null }],
      brand_insights: [{ data: [], error: null }],
      brand_sources: [{ data: [], error: null }],
      research_runs: [{ data: [], error: null }],
      ai_tasks: [
        { data: { id: AI_TASK_ID }, error: null },
        { error: null },
        { error: null },
      ],
    });
    const generate = vi.fn().mockResolvedValue({ text: JSON.stringify(bad), model: 'fake-model' });

    const outcome = await runStrategyGeneration(
      { supabase: client, organizationId: ORG_ID, brandId: BRAND_ID, strategyId: STRATEGY_ID },
      { provider: fakeProvider(generate) },
    );

    expect(outcome).toMatchObject({ status: 'FAILED', errorCode: 'VALIDATION_ERROR' });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('classifies exhausted rate limits with the provider failure code', async () => {
    vi.useFakeTimers();
    const client = makeClient({
      strategies: [
        { data: { id: STRATEGY_ID, version: 1 }, error: null },
        { error: null },
        { error: null },
      ],
      brands: [{ data: { name: 'Aurora', website_url: 'https://aurora.dev', industry: null, market_country: null, target_audience: null }, error: null }],
      brand_facts: [{ data: [], error: null }],
      brand_suggestions: [{ data: approvedSuggestionRows(), error: null }],
      brand_insights: [{ data: [], error: null }],
      brand_sources: [{ data: [], error: null }],
      research_runs: [{ data: [], error: null }],
      ai_tasks: [
        { data: { id: AI_TASK_ID }, error: null },
        { error: null },
        { error: null },
        { error: null },
      ],
      audit_logs: [{ error: null }],
    });
    const generate = vi.fn().mockRejectedValue(new AiProviderError('fake', 'rate limited', 429));

    const promise = runStrategyGeneration(
      { supabase: client, organizationId: ORG_ID, brandId: BRAND_ID, strategyId: STRATEGY_ID },
      { provider: fakeProvider(generate) },
    );
    await vi.runAllTimersAsync();
    const outcome = await promise;

    expect(outcome.status).toBe('FAILED');
    expect(outcome.errorCode).toBe('RATE_LIMITED');
    expect(generate).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('marks the strategy FAILED when no provider is configured', async () => {
    const client = makeClient({
      strategies: [
        { data: { id: STRATEGY_ID, version: 1 }, error: null },
        { error: null },
        { error: null },
      ],
      brands: [{ data: { name: 'Aurora' }, error: null }],
      brand_facts: [{ data: [], error: null }],
      brand_suggestions: [{ data: approvedSuggestionRows(), error: null }],
      brand_insights: [{ data: [], error: null }],
      brand_sources: [{ data: [], error: null }],
      research_runs: [{ data: [], error: null }],
      ai_tasks: [
        { data: { id: AI_TASK_ID }, error: null },
        { error: null },
        { error: null },
      ],
    });

    const outcome = await runStrategyGeneration(
      { supabase: client, organizationId: ORG_ID, brandId: BRAND_ID, strategyId: STRATEGY_ID },
      { provider: null },
    );

    expect(outcome).toMatchObject({ status: 'FAILED', errorCode: 'PROVIDER_UNCONFIGURED' });
  });

  it('fails without creating an AI task when the brand has never been analyzed', async () => {
    const client = makeClient({
      strategies: [
        { data: { id: STRATEGY_ID, version: 1 }, error: null },
        { error: null },
        { error: null },
      ],
      brands: [{ data: { name: 'Aurora' }, error: null }],
      brand_facts: [{ data: [], error: null }],
      brand_suggestions: [{ data: [], error: null }],
      brand_insights: [{ data: [], error: null }],
      brand_sources: [{ data: [], error: null }],
      research_runs: [{ data: [], error: null }],
    });

    const outcome = await runStrategyGeneration(
      { supabase: client, organizationId: ORG_ID, brandId: BRAND_ID, strategyId: STRATEGY_ID },
      { provider: fakeProvider(vi.fn()) },
    );

    expect(outcome).toMatchObject({ status: 'FAILED', errorCode: 'INSUFFICIENT_BRAIN' });
    expect(client.from).not.toHaveBeenCalledWith('ai_tasks');
    expect(client.from).not.toHaveBeenCalledWith('audit_logs');
  });

  it('fails with INSUFFICIENT_APPROVED_BRAIN when only PENDING suggestions exist', async () => {
    const client = makeClient({
      strategies: [
        { data: { id: STRATEGY_ID, version: 1 }, error: null },
        { error: null },
        { error: null },
      ],
      brands: [{ data: { name: 'Aurora' }, error: null }],
      brand_facts: [{ data: [{ key: 'brand_name', value: 'Aurora' }], error: null }],
      brand_suggestions: [
        {
          data: approvedSuggestionRows().map((row) => ({ ...row, status: 'PENDING' })),
          error: null,
        },
      ],
      brand_insights: [{ data: [], error: null }],
      brand_sources: [{ data: [], error: null }],
      research_runs: [{ data: [{ id: RUN_ID }], error: null }],
    });

    const outcome = await runStrategyGeneration(
      { supabase: client, organizationId: ORG_ID, brandId: BRAND_ID, strategyId: STRATEGY_ID },
      { provider: fakeProvider(vi.fn()) },
    );

    expect(outcome).toMatchObject({ status: 'FAILED', errorCode: 'INSUFFICIENT_APPROVED_BRAIN' });
    expect(client.from).not.toHaveBeenCalledWith('ai_tasks');
  });
});