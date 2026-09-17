import { describe, it, expect, vi } from 'vitest';
import { AiProviderError } from '@/lib/ai/types';
import { analyzeResearchEvidence, mapIntelligenceToRows, persistBrainRows } from './brain';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const BRAND_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000003';
const SOURCE_ID = '00000000-0000-4000-8000-000000000004';
const TASK_ID = '00000000-0000-4000-8000-000000000005';

function makeSupabaseMock() {
  const queues = new Map<string, Array<() => unknown>>();
  const ok = () => ({ data: [], error: null });

  function chain(table: string) {
    const execute = () => {
      const queue = queues.get(table) ?? [];
      const next = queue.shift();
      return next ? Promise.resolve(next()) : Promise.resolve(ok());
    };
    const thenable: PromiseLike<unknown> = {
      then: (onFulfilled, onRejected) => execute().then(onFulfilled, onRejected),
    };
    const proxy = new Proxy(thenable, {
      get(target, prop) {
        if (prop in target) return Reflect.get(target, prop);
        const name = String(prop);
        if (name === 'maybeSingle') return async () => execute();
        if (name === 'single') {
          return async () => {
            const value = (await execute()) as any;
            return { data: Array.isArray(value?.data) ? value.data[0] : value?.data ?? null, error: value?.error ?? null };
          };
        }
        if (name === 'then' || name === 'catch') return Reflect.get(target, prop);
        return (..._args: unknown[]) => chain(table);
      },
    });
    return proxy as any;
  }

  const client = {
    from: vi.fn((table: string) => chain(String(table))),
    queue: (table: string, ...responses: Array<() => unknown>) => {
      const current = queues.get(table) ?? [];
      current.push(...responses);
      queues.set(table, current);
    },
  };
  return client;
}

const INTELLIGENCE = {
  identity: { brandName: 'Aurora', companyDescription: 'B2B SaaS', industry: 'B2B SaaS', productCategories: ['Analytics'] },
  audience: { targetAudience: 'Ops leaders', buyerPersonas: [], customerTypes: [], painPoints: ['Slow reports'], useCases: [] },
  positioning: { valueProposition: 'Faster insights', differentiators: ['Real-time dashboards'], positioningThemes: [], brandMessaging: null },
  offer: { productsAndServices: ['Aurora Analytics'], keyFeatures: [], benefits: [], pricingSignals: [], callsToAction: [] },
  messaging: { recurringClaims: [], toneOfVoice: [], terminology: [], messagingThemes: ['Data-driven growth'] },
  seo: { importantTopics: [], keywordThemes: [], contentGaps: ['Pricing page missing'], searchIntentOpportunities: [] },
  competition: { namedCompetitors: [], alternatives: [], differentiationClaims: [] },
  evidence: [
    { claim: 'Aurora is a B2B SaaS company.', sourceUrl: 'https://example.com/' },
    { claim: 'Aurora sells real-time analytics.', sourceUrl: 'https://example.com/' },
  ],
};

const validProvider = {
  id: 'gemini',
  defaultModel: 'gemini-3.7-flash',
  configured: () => true,
  health: async () => ({ id: 'gemini', configured: true, ok: true }),
  generate: vi.fn(async () => ({
    text: JSON.stringify(INTELLIGENCE),
    model: 'gemini-3.7-flash',
    usage: { inputTokens: 100, outputTokens: 200 },
  })),
};

describe('mapIntelligenceToRows', () => {
  const sourceIndex = new Map([['https://example.com/', SOURCE_ID]]);

  it('creates section facts with cited evidence source ids', () => {
    const { facts } = mapIntelligenceToRows(INTELLIGENCE as any, sourceIndex, ORG_ID, BRAND_ID, RUN_ID);
    expect(facts.length).toBeGreaterThanOrEqual(1);
    const identityFact = facts.find((f) => f.key === 'identity');
    expect(identityFact?.brand_id).toBe(BRAND_ID);
    expect(identityFact?.source_type).toBe('AI_INFERRED');
    expect(identityFact?.evidence_source_ids).toEqual([SOURCE_ID]);
    expect(identityFact?.approved).toBe(false);
  });

  it('skips empty sections', () => {
    const empty = { ...INTELLIGENCE, competition: { namedCompetitors: [], alternatives: [], differentiationClaims: [] } };
    const { facts } = mapIntelligenceToRows(empty as any, sourceIndex, ORG_ID, BRAND_ID, RUN_ID);
    expect(facts.find((f) => f.key === 'competition')).toBeUndefined();
  });

  it('produces insights for opportunities, pain points and evidence claims', () => {
    const { insights } = mapIntelligenceToRows(INTELLIGENCE as any, sourceIndex, ORG_ID, BRAND_ID, RUN_ID);
    expect(insights.some((i) => i.category === 'SEO' && i.description.includes('Pricing page missing'))).toBe(true);
    expect(insights.some((i) => i.category === 'AUDIENCE' && i.description.includes('Slow reports'))).toBe(true);
    const evidenceClaims = insights.filter((i) => i.category === 'EVIDENCE');
    expect(evidenceClaims).toHaveLength(2);
    expect(evidenceClaims[0].evidence_source_ids).toEqual([SOURCE_ID]);
  });
});

describe('persistBrainRows', () => {
  it('replaces prior AI-inferred facts and insights with fresh rows', async () => {
    const client = makeSupabaseMock();
    client.queue('brand_facts', () => ({ data: null, error: null }), () => ({ data: null, error: null }));
    client.queue('brand_insights', () => ({ data: null, error: null }), () => ({ data: null, error: null }));

    const rows = mapIntelligenceToRows(INTELLIGENCE as any, new Map([['https://example.com/', SOURCE_ID]]), ORG_ID, BRAND_ID, RUN_ID);
    const counts = await persistBrainRows(client as any, rows, BRAND_ID, ORG_ID);

    expect(counts.factsWritten).toBe(rows.facts.length);
    expect(counts.insightsWritten).toBe(rows.insights.length);
  });
});

describe('analyzeResearchEvidence', () => {
  it('persists facts and insights when extraction succeeds', async () => {
    const client = makeSupabaseMock();
    client.queue('research_sources', () => ({ data: [{ brand_sources: { id: SOURCE_ID, url: 'https://example.com/', canonical_url: null, title: 'Aurora', extracted_text: 'Aurora sells analytics.' } }], error: null }));
    client.queue('ai_tasks', () => ({ data: { id: TASK_ID }, error: null }), () => ({ data: null, error: null }));

    const outcome = await analyzeResearchEvidence(client as any, { organizationId: ORG_ID, brandId: BRAND_ID, researchRunId: RUN_ID }, { provider: validProvider as any });

    expect(outcome.status).toBe('SUCCEEDED');
    expect(outcome.aiTaskId).toBe(TASK_ID);
    expect(outcome.provider).toBe('gemini');
    expect(outcome.factsWritten).toBeGreaterThan(0);
    expect(outcome.insightsWritten).toBeGreaterThan(0);
  });

  it('returns SKIPPED when there is no evidence', async () => {
    const client = makeSupabaseMock();
    client.queue('research_sources', () => ({ data: [], error: null }));

    const outcome = await analyzeResearchEvidence(client as any, { organizationId: ORG_ID, brandId: BRAND_ID, researchRunId: RUN_ID }, { provider: validProvider as any });
    expect(outcome.status).toBe('SKIPPED');
    expect(outcome.errorCode).toBe('NO_EVIDENCE');
  });

  it('marks the AI task as FAILED on a provider error', async () => {
    const failingProvider = {
      id: 'groq',
      defaultModel: 'llama',
      configured: () => true,
      health: async () => ({ id: 'groq', configured: true, ok: true }),
      generate: vi.fn(async () => {
        throw new AiProviderError('groq', 'quota exceeded', 429);
      }),
    };

    const client = makeSupabaseMock();
    client.queue('research_sources', () => ({ data: [{ brand_sources: { id: SOURCE_ID, url: 'https://example.com/', canonical_url: null, title: 'Aurora', extracted_text: 'text' } }], error: null }));
    client.queue('ai_tasks', () => ({ data: { id: TASK_ID }, error: null }), () => ({ data: null, error: null }));

    const outcome = await analyzeResearchEvidence(client as any, { organizationId: ORG_ID, brandId: BRAND_ID, researchRunId: RUN_ID }, { provider: failingProvider as any });
    expect(outcome.status).toBe('FAILED');
    expect(outcome.aiTaskId).toBe(TASK_ID);
    expect(outcome.errorCode).toBe('AI_ANALYSIS_FAILED');
    expect(outcome.provider).toBe('groq');
    expect(outcome.model).toBe('llama');
  });

  it('retries a transient provider error and succeeds on the next attempt', async () => {
    let calls = 0;
    const flakyProvider = {
      id: 'gemini',
      defaultModel: 'gemini-3.6-flash',
      configured: () => true,
      health: async () => ({ id: 'gemini', configured: true, ok: true }),
      generate: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new AiProviderError('gemini', '{"code":503,"status":"UNAVAILABLE"}', 503);
        return { text: JSON.stringify(INTELLIGENCE), model: 'gemini-3.6-flash', usage: { inputTokens: 10, outputTokens: 20 } };
      }),
    };

    const client = makeSupabaseMock();
    client.queue('research_sources', () => ({ data: [{ brand_sources: { id: SOURCE_ID, url: 'https://example.com/', canonical_url: null, title: 'Aurora', extracted_text: 'Aurora sells analytics.' } }], error: null }));
    client.queue('ai_tasks', () => ({ data: { id: TASK_ID }, error: null }), () => ({ data: null, error: null }), () => ({ data: null, error: null }));

    const outcome = await analyzeResearchEvidence(client as any, { organizationId: ORG_ID, brandId: BRAND_ID, researchRunId: RUN_ID }, { provider: flakyProvider as any });
    expect(calls).toBe(2);
    expect(outcome.status).toBe('SUCCEEDED');
    expect(outcome.provider).toBe('gemini');
  });

  it('marks the AI task as FAILED when no provider is configured', async () => {
    const client = makeSupabaseMock();
    client.queue('research_sources', () => ({ data: [{ brand_sources: { id: SOURCE_ID, url: 'https://example.com/', canonical_url: null, title: 'A', extracted_text: 'text' } }], error: null }));
    client.queue('ai_tasks', () => ({ data: { id: TASK_ID }, error: null }), () => ({ data: null, error: null }));

    const outcome = await analyzeResearchEvidence(client as any, { organizationId: ORG_ID, brandId: BRAND_ID, researchRunId: RUN_ID }, { provider: null });
    expect(outcome.status).toBe('FAILED');
    expect(outcome.errorCode).toBe('PROVIDER_UNCONFIGURED');
  });

  it('returns SKIPPED when the sources query fails', async () => {
    const client = makeSupabaseMock();
    client.queue('research_sources', () => ({ data: null, error: { message: 'connection refused' } }));

    const outcome = await analyzeResearchEvidence(client as any, { organizationId: ORG_ID, brandId: BRAND_ID, researchRunId: RUN_ID }, { provider: validProvider as any });
    expect(outcome.status).toBe('SKIPPED');
  });
});