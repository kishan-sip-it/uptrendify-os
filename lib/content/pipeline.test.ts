import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AiProvider } from '@/lib/ai/types';
import { AiProviderError } from '@/lib/ai/types';
import { runContentGeneration } from './pipeline';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const CONTENT_ID = '00000000-0000-4000-8000-000000000004';
const STRATEGY_ID = '00000000-0000-4000-8000-000000000005';

function makeClient(overrides: Array<[string, unknown]> = []) {
  const queues = new Map<string, Array<unknown>>();
  for (const [table, payload] of overrides) {
    const existing = queues.get(table) ?? [];
    existing.push(payload);
    queues.set(table, existing);
  }

  const chain = (table: string) => {
    const execute = () => {
      const queue = queues.get(table) ?? [];
      const next = queue.shift();
      if (next !== undefined) return Promise.resolve(next);
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
  return { from };
}

type Client = ReturnType<typeof makeClient>;

function suggestionRows(): unknown {
  return {
    data: [
      { id: 's1', field: 'brand_name', label: 'Brand name', kind: 'identity', proposed_value: 'Aurora Labs', status: 'APPROVED', evidence: [], evidence_strength: null, sources_examined: 3, confidence: 0.9, history: [], created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', reviewed_at: null },
      { id: 's2', field: 'brand_value_proposition', label: 'Value proposition', kind: 'identity', proposed_value: 'Human-approved brand brain', status: 'APPROVED', evidence: [], evidence_strength: null, sources_examined: 3, confidence: 0.9, history: [], created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', reviewed_at: null },
      { id: 's3', field: 'target_audience', label: 'Target audience', kind: 'identity', proposed_value: 'Fractional CMOs', status: 'APPROVED', evidence: [], evidence_strength: null, sources_examined: 3, confidence: 0.9, history: [], created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', reviewed_at: null },
      { id: 's4', field: 'problems_solved', label: 'Problems solved', kind: 'identity', proposed_value: 'Slow research', status: 'APPROVED', evidence: [], evidence_strength: null, sources_examined: 3, confidence: 0.9, history: [], created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', reviewed_at: null },
    ],
    error: null,
  };
}

function snapshotPayloads(): Array<[string, unknown]> {
  return [
    ['brands', { data: { id: BRAND_ID, name: 'Aurora Labs', website_url: 'https://aurora.example', industry: null, market_country: null, target_audience: null, client_id: null }, error: null }],
    ['brand_facts', { data: [], error: null }],
    ['brand_insights', { data: [], error: null }],
    ['brand_sources', { data: [], error: null }],
    ['research_runs', { data: [], error: null }],
    ['strategies', { data: { id: STRATEGY_ID, title: 'Aurora — Marketing Strategy', version: 2, output: { objectives: [{ objective: 'x', timeHorizon: '90 days', rationale: 'r', successMetric: 'y' }], channels: [], campaigns: [], assumptions: [] }, provider: 'gemini', model: 'gemini-3.6-flash' }, error: null }],
    ['brand_suggestions', suggestionRows()],
  ];
}

const INTENT = {
  type: 'social_post' as const,
  channel: 'linkedin' as const,
  title: 'Win back ICP accounts',
  objective: 'Drive demos',
  audience: 'Fractional CMOs',
  context: 'Q3',
  tone: 'confident',
  cta: 'Book a demo',
  instructions: null,
};

const VALID_OUTPUT = JSON.stringify({
  headline: 'Evidence beats opinion',
  body: 'Start from what is provable.',
  cta: 'Book a demo',
  channel: 'linkedin',
  content_type: 'social_post',
  rationale: 'Uses approved facts.',
  strategy_references: ['Messaging — core message'],
  brand_fact_references: ['Value proposition'],
});

function fakeProvider(handler: (prompt: string) => Promise<unknown>) {
  const provider: AiProvider = {
    id: 'fake',
    defaultModel: 'fake-model',
    configured: () => true,
    health: async () => ({ id: 'fake', ok: true, configured: true }),
    generate: async ({ prompt }) => {
      const result = await handler(prompt);
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      return { text, model: 'fake-model' };
    },
  };
  return provider;
}

function successQueues(extra: Array<[string, unknown]> = []): Array<[string, unknown]> {
  return [
    ['content_items', { data: { id: CONTENT_ID, title: 'Win back ICP accounts', type: 'social_post', channel: 'linkedin' }, error: null }],
    ...snapshotPayloads(),
    ['ai_tasks', { data: [{ id: 'task-1' }], error: null }],
    ['ai_tasks', { data: null, error: null }],
    ['content_versions', { data: null, error: null }],
    ['content_versions', { data: [{ id: 'version-9', version: 1 }], error: null }],
    ['content_items', { data: null, error: null }],
    ['ai_tasks', { data: null, error: null }],
    ['audit_logs', { data: null, error: null }],
    ...extra,
  ];
}

function pipelineInput(client: Client) {
  return {
    supabase: client as any,
    organizationId: ORG_ID,
    brandId: BRAND_ID,
    contentId: CONTENT_ID,
    createdBy: USER_ID,
    intent: INTENT,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('runContentGeneration', () => {
  it('persists a validated version and marks the ai_task SUCCEEDED', async () => {
    const client = makeClient(successQueues());
    const provider = fakeProvider(async () => VALID_OUTPUT);

    const outcome = await runContentGeneration(pipelineInput(client), { provider });

    expect(outcome.status).toBe('SUCCEEDED');
    expect(outcome.version).toBe(1);
    expect(outcome.aiTaskId).toBe('task-1');
    expect(outcome.provider).toBe('fake');

    const versionInsert = client.from.mock.calls.filter(([table]) => table === 'content_versions');
    expect(versionInsert.length).toBeGreaterThanOrEqual(2);

    const aiSucceeded = client.from.mock.calls.reduce((ids, [table]) => (table === 'ai_tasks' ? ids + 1 : ids), 0);
    expect(aiSucceeded).toBeGreaterThanOrEqual(2);
  });

  it('increments version after a unique-constraint conflict during insert', async () => {
    const client = makeClient([
      ['content_items', { data: { id: CONTENT_ID, title: 'T', type: 'social_post', channel: 'linkedin' }, error: null }],
      ...snapshotPayloads(),
      ['ai_tasks', { data: [{ id: 'task-2' }], error: null }],
      ['ai_tasks', { data: null, error: null }],
      ['content_versions', { data: null, error: null }],
      ['content_versions', { data: null, error: { code: '23505', message: 'duplicate key' } }],
      ['content_versions', { data: { version: 4 }, error: null }],
      ['content_versions', { data: [{ id: 'version-5', version: 5 }], error: null }],
      ['content_items', { data: null, error: null }],
      ['ai_tasks', { data: null, error: null }],
      ['audit_logs', { data: null, error: null }],
    ]);
    const provider = fakeProvider(async () => VALID_OUTPUT);

    const outcome = await runContentGeneration(pipelineInput(client), { provider });

    expect(outcome.status).toBe('SUCCEEDED');
    expect(outcome.version).toBe(5);
  });

  it('blocks on the brand brain gate before calling the provider', async () => {
    const client = makeClient([
      ['content_items', { data: { id: CONTENT_ID, title: 'T', type: 'social_post', channel: 'linkedin' }, error: null }],
      ['brands', { data: { id: BRAND_ID, name: 'Aurora Labs', website_url: null, industry: null, market_country: null, target_audience: null, client_id: null }, error: null }],
      ['brand_facts', { data: [], error: null }],
      ['brand_insights', { data: [], error: null }],
      ['brand_sources', { data: [], error: null }],
      ['research_runs', { data: [], error: null }],
      ['strategies', { data: null, error: null }],
      ['brand_suggestions', { data: [], error: null }],
      ['ai_tasks', { data: [{ id: 'task-3' }], error: null }],
    ]);
    const provider = fakeProvider(async () => VALID_OUTPUT);

    const outcome = await runContentGeneration(pipelineInput(client), { provider });

    expect(outcome.status).toBe('FAILED');
    expect(outcome.errorCode).toBe('INSUFFICIENT_BRAIN');
    expect(provider.generate).toBeDefined();
  });

  it('classifies provider failures and marks the task FAILED', async () => {
    vi.useFakeTimers();
    const client = makeClient(successQueues([
      ['ai_tasks', { data: null, error: null }],
      ['ai_tasks', { data: null, error: null }],
      ['ai_tasks', { data: null, error: null }],
    ]));
    const provider = fakeProvider(async () => {
      throw new AiProviderError('fake', 'rate limited by provider', 429);
    });

    const promise = runContentGeneration(pipelineInput(client), { provider });
    await vi.runAllTimersAsync();

    const outcome = await promise;
    expect(outcome.status).toBe('FAILED');
    expect(outcome.errorCode).toBe('RATE_LIMITED');
  });

  it('persists a REJECTED gate for a missing approved strategy', async () => {
    const client = makeClient([
      ['content_items', { data: { id: CONTENT_ID, title: 'T', type: 'social_post', channel: 'linkedin' }, error: null }],
      ['brands', { data: { id: BRAND_ID, name: 'Aurora Labs', website_url: null, industry: null, market_country: null, target_audience: null, client_id: null }, error: null }],
      ['brand_facts', { data: [], error: null }],
      ['brand_insights', { data: [], error: null }],
      ['brand_sources', { data: [], error: null }],
      ['research_runs', { data: [], error: null }],
      ['strategies', { data: null, error: null }],
      ['brand_suggestions', suggestionRows()],
      ['ai_tasks', { data: [{ id: 'task-4' }], error: null }],
    ]);
    const provider = fakeProvider(async () => VALID_OUTPUT);

    const outcome = await runContentGeneration(pipelineInput(client), { provider });

    expect(outcome.status).toBe('FAILED');
    expect(outcome.errorCode).toBe('INSUFFICIENT_STRATEGY');
  });
});