import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { strategySchema } from '@/lib/strategy/schema';
import { envSchema, resetEnv } from '@/lib/env';
import fixtureJson from './fixtures/aurora.json';
import {
  REPLAY_ORG_SLUG,
  fixture,
  isReplayOrgSlug,
  isReplayOrganization,
  buildReplayDraft,
  candidateSourceCount,
  completeReplayResearchRun,
  completeReplayStrategy,
  regenerateReplaySuggestion,
} from './index';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const RUN_ID = '00000000-0000-4000-8000-000000000004';
const STRATEGY_ID = '00000000-0000-4000-8000-000000000005';
const SUGGESTION_ID = '00000000-0000-4000-8000-000000000006';
const SOURCE_ID = '00000000-0000-4000-8000-000000000007';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeClient(overrides: Array<[string, unknown]> = []): any {
  const queues = new Map<string, Array<unknown>>();
  for (const [table, payload] of overrides) {
    const existing = queues.get(table) ?? [];
    existing.push(payload);
    queues.set(table, existing);
  }

  const chain = (table: string) => {
    const execute = async () => {
      const queue = queues.get(table) ?? [];
      const next = queue.shift();
      if (next !== undefined) return Promise.resolve(next);
      return Promise.resolve({ data: [], error: null });
    };
    const thenable: PromiseLike<unknown> = { then: (onFul) => execute().then(onFul) };
    const proxy = new Proxy(thenable, {
      get(target, prop) {
        if (prop in target || prop === 'then' || prop === 'catch') return Reflect.get(target, prop);
        const name = String(prop);
        if (name === 'maybeSingle') return async () => execute();
        if (name === 'single') {
          return async () => {
            const value: any = await execute();
            const data = Array.isArray(value?.data) ? value.data[0] : (value?.data ?? null);
            return { data, error: value?.error ?? null };
          };
        }
        return () => chain(table);
      },
    });
    return proxy;
  };

  const from = vi.fn((table: string) => chain(String(table)));
  return {
    from,
    queue: (table: string, payload: unknown) => {
      const existing = queues.get(table) ?? [];
      existing.push(payload);
      queues.set(table, existing);
    },
  };
}

function sourceRows() {
  return fixtureJson.sources.map((source, index) => ({
    id: `${SOURCE_ID.slice(0, -1)}${index}`,
    url: source.url,
    canonical_url: source.canonicalUrl,
    title: source.title,
  }));
}

const approvedSuggestionRows = fixtureJson.suggestions.map((suggestion) => ({
  id: `sug-${suggestion.field}`,
  field: suggestion.field,
  label: suggestion.label,
  kind: suggestion.kind,
  proposed_value: suggestion.proposedValue,
  status: fixtureJson.approvedFields.includes(suggestion.field) ? 'APPROVED' : 'PENDING',
  evidence: [],
  evidence_strength: null,
  sources_examined: candidateSourceCount(),
  confidence: suggestion.confidence,
  history: [],
}));

describe('replay fixtures', () => {
  it('strategy fixture passes the strategy schema', () => {
    const parsed = strategySchema.safeParse(fixtureJson.strategy);
    expect(parsed.success).toBe(true);
  });

  it('has a valid replay provider and model label', () => {
    expect(REPLAY_ORG_SLUG).toBe('aurora-labs-presentation');
    expect(fixture.meta.providerLabel).toBe('replay');
    expect(fixture.meta.modelLabel).toMatch(/presentation-fixture/);
  });

  it('provides every suggestion field with deterministic values', () => {
    const fields = fixture.suggestions.map((s) => s.field);
    expect(fields.length).toBeGreaterThanOrEqual(20);
    expect(new Set(fields).size).toBe(fields.length);
    expect(fields).toContain('brand_name');
  });

  it('pre-approves the gate-critical fields', () => {
    expect(fixture.approvedFields.length).toBeGreaterThanOrEqual(4);
    expect(fixture.approvedFields).toContain('brand_name');
  });
});

describe('AI execution mode env', () => {
  it('defaults to live execution', () => {
    expect(envSchema.parse({}).AI_EXECUTION_MODE).toBe('live');
  });

  it('accepts replay as an explicit value', () => {
    expect(envSchema.parse({ AI_EXECUTION_MODE: 'replay' }).AI_EXECUTION_MODE).toBe('replay');
  });

  it('rejects unknown execution modes', () => {
    expect(() => envSchema.parse({ AI_EXECUTION_MODE: 'fast' })).toThrow();
  });

  it('treats an empty value as the live default', () => {
    expect(envSchema.parse({ AI_EXECUTION_MODE: '' }).AI_EXECUTION_MODE).toBe('live');
  });
});

describe('replay org slug helpers', () => {
  beforeEach(() => resetEnv());
  afterEach(() => {
    delete process.env.AI_EXECUTION_MODE;
    resetEnv();
  });

  it('never matches in live mode', () => {
    expect(isReplayOrgSlug(REPLAY_ORG_SLUG)).toBe(false);
    expect(isReplayOrgSlug('some-other-org')).toBe(false);
  });

  it('matches only the replay organization slug in replay mode', () => {
    process.env.AI_EXECUTION_MODE = 'replay';
    expect(isReplayOrgSlug(REPLAY_ORG_SLUG)).toBe(true);
    expect(isReplayOrgSlug('some-other-org')).toBe(false);
  });
});

describe('replay organization gate', () => {
  beforeEach(() => resetEnv());
  afterEach(() => {
    delete process.env.AI_EXECUTION_MODE;
    resetEnv();
  });

  it('returns false without a database call when mode is live', async () => {
    const client = makeClient();
    const called = vi.spyOn(client, 'from');
    await expect(isReplayOrganization(client, ORG_ID)).resolves.toBe(false);
    expect(called).not.toHaveBeenCalled();
  });

  it('returns false when the organization slug does not match', async () => {
    process.env.AI_EXECUTION_MODE = 'replay';
    const client = makeClient([['organizations', { data: { slug: 'other-org' }, error: null }]]);
    await expect(isReplayOrganization(client, ORG_ID)).resolves.toBe(false);
  });

  it('returns true for the presentation organization in replay mode', async () => {
    process.env.AI_EXECUTION_MODE = 'replay';
    const client = makeClient([['organizations', { data: { slug: REPLAY_ORG_SLUG }, error: null }]]);
    await expect(isReplayOrganization(client, ORG_ID)).resolves.toBe(true);
  });
});

describe('replay drafts', () => {
  it('builds a deterministic pending draft with mapped evidence', () => {
    const sourceIndex = new Map(sourceRows().map((row) => [row.canonical_url, row.id]));
    const urlTitles = new Map(sourceRows().map((row) => [row.canonical_url, row.title]));

    const entry = fixture.suggestions.find((s) => s.field === 'brand_description')!;
    const draft = buildReplayDraft(entry, sourceIndex, urlTitles);

    expect(draft.status).toBe('PENDING');
    expect(draft.found).toBe(true);
    expect(draft.field).toBe('brand_description');
    expect(draft.sourcesExamined).toBe(candidateSourceCount());
    expect(draft.evidence.length).toBeGreaterThan(0);
    expect(draft.evidence[0]).toMatchObject({ claim: expect.any(String), strength: expect.any(String) });
  });
});

describe('completeReplayResearchRun', () => {
  it('marks the run completed, inserts sources, suggestions, insights and ai task', async () => {
    const client = makeClient([
      ['brand_sources', { data: null, error: null }],
      ['brand_sources', { data: sourceRows(), error: null }],
      ['research_sources', { data: null, error: null }],
      ['brand_source_chunks', { data: null, error: null }],
      ['brand_source_chunks', { data: null, error: null }],
      ['brand_source_chunks', { data: null, error: null }],
      ['brand_source_chunks', { data: null, error: null }],
      ['research_runs', { data: null, error: null }],
      ['ai_tasks', { data: null, error: null }],
      ['brand_suggestions', { data: [], error: null }],
      ['brand_insights', { data: null, error: null }],
      ['brand_insights', { data: null, error: null }],
      ['audit_logs', { data: null, error: null }],
    ]);

    const outcome = await completeReplayResearchRun(client, {
      organizationId: ORG_ID,
      brandId: BRAND_ID,
      researchRunId: RUN_ID,
      userId: USER_ID,
    });

    expect(outcome).toMatchObject({ status: 'COMPLETED', brainStatus: 'SUCCEEDED' });
    const tables = client.from.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(tables).toContain('brand_sources');
    expect(tables).toContain('research_runs');
    expect(tables).toContain('ai_tasks');
    expect(tables).toContain('brand_suggestions');
    expect(tables).toContain('brand_insights');
    expect(tables).toContain('audit_logs');
  });
});

describe('completeReplayStrategy', () => {
  it('fails with INSUFFICIENT_APPROVED_BRAIN when the approval gate is not met', async () => {
    const rows = approvedSuggestionRows.map((row) => ({ ...row, status: row.status === 'APPROVED' ? 'PENDING' : row.status }));
    const client = makeClient([
      ['brand_suggestions', { data: rows, error: null }],
      ['strategies', { data: null, error: null }],
    ]);

    const outcome = await completeReplayStrategy(client, {
      organizationId: ORG_ID,
      brandId: BRAND_ID,
      strategyId: STRATEGY_ID,
      userId: USER_ID,
      input: { version: 2 },
    });

    expect(outcome).toMatchObject({ status: 'FAILED', errorCode: 'INSUFFICIENT_APPROVED_BRAIN' });
    expect(outcome.errorMessage).toMatch(/approv/i);
    const tables = client.from.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(tables).toContain('ai_tasks');
    expect(tables.filter((t: string) => t === 'strategies').length).toBeGreaterThanOrEqual(2);
  });

  it('succeeds and persists the fixture strategy output when the gate passes', async () => {
    const client = makeClient([
      ['brand_suggestions', { data: approvedSuggestionRows, error: null }],
      ['strategies', { data: null, error: null }],
      ['research_runs', { data: { id: RUN_ID }, error: null }],
      ['brand_sources', { data: sourceRows(), error: null }],
      ['strategies', { data: null, error: null }],
      ['ai_tasks', { data: null, error: null }],
      ['audit_logs', { data: null, error: null }],
    ]);

    const outcome = await completeReplayStrategy(client, {
      organizationId: ORG_ID,
      brandId: BRAND_ID,
      strategyId: STRATEGY_ID,
      userId: USER_ID,
      input: { version: 1 },
    });

    expect(outcome).toMatchObject({ status: 'SUCCEEDED', version: 1 });
    const tables = client.from.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(tables).toContain('ai_tasks');
    expect(tables).toContain('research_runs');
    expect(tables).toContain('brand_sources');
    expect(tables).toContain('audit_logs');
  });
});

describe('regenerateReplaySuggestion', () => {
  it('rewrites a suggestion with a deterministic fixture draft', async () => {
    const existing = approvedSuggestionRows.find((row) => row.field === 'brand_name')!;
    const client = makeClient([
      ['brand_suggestions', { data: existing, error: null }],
      ['brand_sources', { data: sourceRows(), error: null }],
      ['ai_tasks', { data: null, error: null }],
      ['brand_suggestions', { data: null, error: null }],
    ]);

    const draft = await regenerateReplaySuggestion(client, {
      organizationId: ORG_ID,
      brandId: BRAND_ID,
      suggestionId: SUGGESTION_ID,
    });

    expect(draft.field).toBe('brand_name');
    expect(draft.status).toBe('PENDING');
    expect(draft.proposedValue).toBe('Aurora Labs');
    const tables = client.from.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(tables).toContain('ai_tasks');
  });

  it('throws SUGGESTION_NOT_FOUND for a missing row', async () => {
    const client = makeClient([['brand_suggestions', { data: null, error: null }]]);
    await expect(
      regenerateReplaySuggestion(client, { organizationId: ORG_ID, brandId: BRAND_ID, suggestionId: SUGGESTION_ID }),
    ).rejects.toThrow('SUGGESTION_NOT_FOUND');
  });
});