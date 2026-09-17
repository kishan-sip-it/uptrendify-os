import { describe, it, expect, vi } from 'vitest';
import { AiProviderError } from '@/lib/ai/types';
import { analyzeResearchEvidence, mapIntelligenceToInsights, persistInsights } from './brain';
import { deriveAllSuggestionDrafts, deriveSuggestionDraft, persistSuggestionDrafts, ALL_FIELDS } from '@/lib/brain/suggestions';

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
  identity: { brandName: 'Aurora', companyDescription: 'B2B SaaS', industry: 'B2B SaaS', businessModel: null, primaryMarket: null, geography: null, productCategories: ['Analytics'] },
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

describe('deriveSuggestionDraft', () => {
  const sourceIndex = new Map([['https://example.com/', SOURCE_ID]]);
  const sources = [
    { url: 'https://example.com/', title: 'Aurora', text: 'Aurora is a B2B SaaS company selling real-time analytics.' },
  ];
  const fieldByName = new Map(ALL_FIELDS.map((def) => [def.field, def]));

  it('creates a PENDING suggestion with cited evidence for a found field', () => {
    const draft = deriveSuggestionDraft(fieldByName.get('brand_name')!, INTELLIGENCE as any, sources, sourceIndex);
    expect(draft.field).toBe('brand_name');
    expect(draft.proposedValue).toBe('Aurora');
    expect(draft.status).toBe('PENDING');
    expect(draft.found).toBe(true);
    expect(draft.evidence.length).toBeGreaterThan(0);
    expect(draft.evidence[0].sourceId).toBe(SOURCE_ID);
    expect(draft.evidence[0].strength).toBe('partial');
    expect(draft.evidenceStrength).toBe('partial');
    expect(draft.confidence).toBe(0.85);
  });

  it('labels fields with no matching citation as weak evidence', () => {
    const draft = deriveSuggestionDraft(fieldByName.get('pain_points')!, INTELLIGENCE as any, sources, sourceIndex);
    expect(draft.found).toBe(true);
    expect(draft.evidence).toEqual([]);
    expect(draft.evidenceStrength).toBe('weak');
    expect(draft.confidence).toBe(0.6);
  });

  it('produces NOT_FOUND suggestions when the brand site does not state a field', () => {
    const draft = deriveSuggestionDraft(fieldByName.get('buyer_personas')!, INTELLIGENCE as any, sources, sourceIndex);
    expect(draft.status).toBe('NOT_FOUND');
    expect(draft.found).toBe(false);
    expect(draft.proposedValue).toBeNull();
    expect(draft.evidence).toEqual([]);
    expect(draft.evidenceStrength).toBeNull();
  });

  it('derives all field catalog entries', () => {
    const drafts = deriveAllSuggestionDrafts(INTELLIGENCE as any, sources, sourceIndex);
    expect(drafts).toHaveLength(ALL_FIELDS.length);
    expect(drafts.filter((d) => d.status === 'NOT_FOUND').length).toBeGreaterThan(0);
    expect(drafts.filter((d) => d.status === 'PENDING').length).toBeGreaterThan(0);
  });
});

describe('persistSuggestionDrafts', () => {
  it('creates drafts, updates PENDING rows, and never overrides human-reviewed rows', async () => {
    const client = makeSupabaseMock();
    client.queue('brand_suggestions', () => ({
      data: [
        { id: 'aa', field: 'brand_name', status: 'APPROVED', proposed_value: 'Aurora', history: [], updated_at: '2026-09-01T00:00:00Z', evidence: [] },
        { id: 'bb', field: 'industry', status: 'PENDING', proposed_value: 'Old value', history: [], updated_at: '2026-09-01T00:00:00Z', evidence: [] },
      ],
      error: null,
    }));

    const drafts = deriveAllSuggestionDrafts(INTELLIGENCE as any, [], new Map());
    const counts = await persistSuggestionDrafts(client as any, { organizationId: ORG_ID, brandId: BRAND_ID, researchRunId: RUN_ID }, drafts);

    expect(counts.created).toBeGreaterThan(0);
    expect(counts.updated).toBeGreaterThanOrEqual(1);
    expect(counts.untouched).toBe(1);
  });
});

describe('mapIntelligenceToInsights', () => {
  const sourceIndex = new Map([['https://example.com/', SOURCE_ID]]);

  it('produces insights for opportunities, pain points and evidence claims', () => {
    const insights = mapIntelligenceToInsights(INTELLIGENCE as any, sourceIndex, ORG_ID, BRAND_ID, RUN_ID);
    expect(insights.some((i) => i.category === 'SEO' && i.description.includes('Pricing page missing'))).toBe(true);
    expect(insights.some((i) => i.category === 'AUDIENCE' && i.description.includes('Slow reports'))).toBe(true);
    const evidenceClaims = insights.filter((i) => i.category === 'EVIDENCE');
    expect(evidenceClaims).toHaveLength(2);
    expect(evidenceClaims[0].evidence_source_ids).toEqual([SOURCE_ID]);
  });
});

describe('persistInsights', () => {
  it('replaces prior AI insights with fresh rows', async () => {
    const client = makeSupabaseMock();
    const insights = mapIntelligenceToInsights(INTELLIGENCE as any, new Map([['https://example.com/', SOURCE_ID]]), ORG_ID, BRAND_ID, RUN_ID);
    const count = await persistInsights(client as any, insights, BRAND_ID, ORG_ID);
    expect(count).toBe(insights.length);
  });
});

describe('analyzeResearchEvidence', () => {
  it('persists suggestions and insights when extraction succeeds', async () => {
    const client = makeSupabaseMock();
    client.queue('research_sources', () => ({ data: [{ brand_sources: { id: SOURCE_ID, url: 'https://example.com/', canonical_url: null, title: 'Aurora', extracted_text: 'Aurora sells analytics.' } }], error: null }));
    client.queue('ai_tasks', () => ({ data: { id: TASK_ID }, error: null }), () => ({ data: null, error: null }));

    const outcome = await analyzeResearchEvidence(client as any, { organizationId: ORG_ID, brandId: BRAND_ID, researchRunId: RUN_ID }, { provider: validProvider as any });

    expect(outcome.status).toBe('SUCCEEDED');
    expect(outcome.aiTaskId).toBe(TASK_ID);
    expect(outcome.provider).toBe('gemini');
    expect(outcome.suggestionsWritten).toBeGreaterThan(0);
    expect(outcome.suggestionsFound).toBeGreaterThan(0);
    expect(outcome.suggestionsNotFound).toBeGreaterThan(0);
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