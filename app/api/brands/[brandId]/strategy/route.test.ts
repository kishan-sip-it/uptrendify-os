import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const STRATEGY_ID = '00000000-0000-4000-8000-000000000004';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  scheduleStrategyExecution: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireOrgRole: mocks.requireOrgRole,
  CAN_GENERATE_STRATEGY: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'],
  CAN_VIEW_BRAND: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'],
}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock('@/lib/strategy/pipeline', () => ({
  scheduleStrategyExecution: mocks.scheduleStrategyExecution,
  STRATEGY_ACTIVE_STATUSES: ['QUEUED', 'RUNNING'],
}));

function makeClient(overrides: Array<[string, unknown]> = []) {
  const queues = new Map<string, Array<unknown>>();
  for (const [table, payload] of overrides) {
    const existing = queues.get(table) ?? [];
    existing.push(payload);
    queues.set(table, existing);
  }

  if (!queues.has('brand_suggestions')) {
    queues.set('brand_suggestions', [{
      data: [
        { id: 'sg-1', field: 'brand_name', label: 'Brand name', proposed_value: 'Aurora', status: 'APPROVED' },
        { id: 'sg-2', field: 'industry', label: 'Industry', proposed_value: 'SaaS', status: 'APPROVED' },
        { id: 'sg-3', field: 'target_audience', label: 'Audience', proposed_value: 'Teams', status: 'APPROVED' },
        { id: 'sg-4', field: 'value_proposition', label: 'Value proposition', proposed_value: 'Fast growth', status: 'EDITED' },
      ],
      error: null,
    }]);
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

const REQ = new NextRequest('http://localhost/api/brands', { method: 'POST' });

function authContext() {
  return { context: { organizationId: ORG_ID, role: 'STRATEGIST', userId: USER_ID } };
}

describe('POST /api/brands/[brandId]/strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
  });

  it('queues a strategy with the next version and schedules execution', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora' }, error: null }],
      ['strategies', { data: null, error: null }],
      ['strategies', { data: { version: 2 }, error: null }],
      ['strategies', { data: { id: STRATEGY_ID, status: 'QUEUED', version: 3 }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(REQ, { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ ok: true, strategyId: STRATEGY_ID, status: 'QUEUED', version: 3 });
    expect(mocks.scheduleStrategyExecution).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, brandId: BRAND_ID, strategyId: STRATEGY_ID, createdBy: USER_ID }),
    );
  });

  it('returns 409 when a strategy is already being generated for the brand', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora' }, error: null }],
      ['strategies', { data: { id: STRATEGY_ID, status: 'RUNNING' }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(REQ, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ strategyId: STRATEGY_ID, status: 'RUNNING' });
    expect(mocks.scheduleStrategyExecution).not.toHaveBeenCalled();
  });

  it('replays a terminal strategy as 200 for a repeated idempotency key', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora' }, error: null }],
      ['strategies', { data: { id: STRATEGY_ID, status: 'SUCCEEDED', version: 1 }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', { method: 'POST', body: JSON.stringify({ idempotencyKey: 'strategy-abc-123' }) });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ strategyId: STRATEGY_ID, status: 'SUCCEEDED', version: 1 });
    expect(mocks.scheduleStrategyExecution).not.toHaveBeenCalled();
  });

  it('returns 409 when a repeated idempotency key is still active', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora' }, error: null }],
      ['strategies', { data: { id: STRATEGY_ID, status: 'QUEUED', version: 1 }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', { method: 'POST', body: JSON.stringify({ idempotencyKey: 'strategy-abc-123' }) });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(409);
    expect(mocks.scheduleStrategyExecution).not.toHaveBeenCalled();
  });

  it('recovers from a version conflict by recomputing the version and inserting again', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora' }, error: null }],
      ['strategies', { data: null, error: null }],
      ['strategies', { data: { version: 1 }, error: null }],
      ['strategies', { data: null, error: { code: '23505', message: 'duplicate key' } }],
      ['strategies', { data: null, error: null }],
      ['strategies', { data: { version: 4 }, error: null }],
      ['strategies', { data: { id: STRATEGY_ID, status: 'QUEUED', version: 5 }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(REQ, { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ strategyId: STRATEGY_ID, version: 5 });
  });

  it('returns 404 when the brand is not in the organization', async () => {
    const client = makeClient([['brands', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(REQ, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid brand id', async () => {
    const res = await POST(REQ, { params: Promise.resolve({ brandId: 'not-a-uuid' }) });
    expect(res.status).toBe(400);
  });

  it('returns 401 when authentication is missing', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 401, body: { error: 'Unauthorized' } }, context: null });
    const res = await POST(REQ, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 when the role cannot generate a strategy', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 403, body: { error: 'Forbidden' } }, context: null });
    const res = await POST(REQ, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/brands/[brandId]/strategy', () => {
  it('returns the latest strategy with output and the version history', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora' }, error: null }],
      [
        'strategies',
        {
          data: {
            id: STRATEGY_ID,
            title: 'Aurora — Marketing Strategy',
            status: 'SUCCEEDED',
            version: 2,
            provider: 'gemini',
            model: 'gemini-3.6-flash',
            output: { objectives: [{ objective: 'Grow SEO' }] },
            input_snapshot: { researchRunId: '00000000-0000-4000-8000-000000000099', facts: 6 },
            error_code: null,
            error_message: null,
            created_at: '2026-01-01T00:00:00.000Z',
            started_at: '2026-01-01T00:00:01.000Z',
            finished_at: '2026-01-01T00:00:05.000Z',
          },
          error: null,
        },
      ],
      [
        'strategies',
        {
          data: [
            { id: STRATEGY_ID, title: 'Aurora — Marketing Strategy', status: 'SUCCEEDED', version: 2, provider: 'gemini', model: 'gemini-3.6-flash', error_code: null, error_message: null, created_at: null, started_at: null, finished_at: null },
            { id: 's-0', title: 'Aurora — Marketing Strategy', status: 'FAILED', version: 1, provider: null, model: null, error_code: 'AI_GENERATION_FAILED', error_message: 'nope', created_at: null, started_at: null, finished_at: null },
          ],
          error: null,
        },
      ],
    ]);
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.latest).toMatchObject({
      id: STRATEGY_ID,
      status: 'SUCCEEDED',
      version: 2,
      provider: 'gemini',
      model: 'gemini-3.6-flash',
      output: { objectives: [{ objective: 'Grow SEO' }] },
    });
    expect(body.versions).toHaveLength(2);
    expect(body.versions[0].version).toBe(2);
    expect(body.canGenerate).toBe(true);
  });

  it('returns latest as null when no strategy exists yet', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora' }, error: null }],
      ['strategies', { data: null, error: null }],
      ['strategies', { data: [], error: null }],
    ]);
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.latest).toBeNull();
    expect(body.versions).toEqual([]);
  });

  it('returns 404 when the brand is missing', async () => {
    const client = makeClient([['brands', { data: null, error: null }]]);
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(404);
  });
});