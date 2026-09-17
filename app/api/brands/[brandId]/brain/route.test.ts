import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const RUN_ID = '00000000-0000-4000-8000-000000000004';
const SOURCE_ID = '00000000-0000-4000-8000-000000000005';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({ requireOrgRole: mocks.requireOrgRole, CAN_VIEW_BRAND: ['OWNER'] }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));

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
      return Promise.resolve({ data: null, error: null });
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
  return { from, queue: (table: string, payload: unknown) => {
    const existing = queues.get(table) ?? [];
    existing.push(payload);
    queues.set(table, existing);
  } };
}

describe('GET /api/brands/[brandId]/brain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgRole.mockResolvedValue({ context: { organizationId: ORG_ID, userId: USER_ID, role: 'STRATEGIST' } });
  });

  it('returns facts, insights, sources and the latest run', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID }, error: null }],
      ['brand_facts', { data: [{ id: 'f1', key: 'identity', value: 'Aurora', source_type: 'AI_INFERRED', confidence: 0.95, evidence_source_ids: [SOURCE_ID], approved: false, updated_at: 'x' }], error: null }],
      ['brand_insights', { data: [{ id: 'i1', category: 'EVIDENCE', title: 'Claim', description: 'Aurora is B2B.', priority: 3, evidence_source_ids: [SOURCE_ID], metadata: {}, created_at: 'x' }], error: null }],
      ['brand_sources', { data: [{ id: SOURCE_ID, url: 'https://example.com/', canonical_url: null, title: 'Aurora', http_status: 200, retrieved_at: 'x' }], error: null }],
      [
        'research_runs',
        {
          data: [{ id: RUN_ID, status: 'COMPLETED', pages_processed: 1, pages_discovered: 1, error_code: null, error_message: null, created_at: 'x', started_at: 'x', finished_at: 'x', ai_tasks: [{ research_run_id: RUN_ID, status: 'SUCCEEDED', provider: 'gemini', model: 'gemini-3.7-flash', error_message: null, created_at: 'y' }] }],
          error: null,
        },
      ],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.facts).toHaveLength(1);
    expect(body.facts[0].key).toBe('identity');
    expect(body.insights).toHaveLength(1);
    expect(body.sources).toHaveLength(1);
    expect(body.latestRun).toMatchObject({ id: RUN_ID, status: 'COMPLETED', ai: { provider: 'gemini' } });
  });

  it('returns 404 when the brand is missing', async () => {
    const client = makeClient([['brands', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(404);
  });

  it('returns 403 when the role lacks brand view access', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 403, body: { error: 'Forbidden' } } });
    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(403);
  });
});