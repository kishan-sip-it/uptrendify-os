import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const CLIENT_ID = '00000000-0000-4000-8000-000000000004';
const STRATEGY_ID = '00000000-0000-4000-8000-000000000005';
const CAMP_ID = '00000000-0000-4000-8000-000000000006';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireOrgRole: mocks.requireOrgRole,
  CAN_MANAGE_CAMPAIGNS: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'],
  CAN_VIEW_CAMPAIGNS: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'],
}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));

function makeClient(overrides: Array<[string, unknown]> = []) {
  const queues = new Map<string, Array<unknown>>();
  for (const [table, payload] of overrides) {
    const existing = queues.get(table) ?? [];
    existing.push(payload);
    queues.set(table, existing);
  }

  const chain = (table: string, initialQueue?: boolean) => {
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
        if (name === 'range') return () => chain(table);
        return () => chain(table);
      },
    });
    return proxy;
  };

  const from = vi.fn((table: string) => chain(String(table)));
  return { from };
}

function authContext() {
  return { context: { organizationId: ORG_ID, role: 'STRATEGIST', userId: USER_ID } };
}

const BRAND = { data: { id: BRAND_ID, name: 'Aurora Labs', client_id: CLIENT_ID }, error: null };
const APPROVED_STRATEGY = {
  data: { id: STRATEGY_ID, title: 'Q1 Growth', version: 2, status: 'SUCCEEDED' },
  error: null,
};

describe('POST /api/brands/[brandId]/campaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
  });

  it('creates a draft campaign grounded on an approved strategy', async () => {
    const client = makeClient([
      ['brands', BRAND],
      ['strategies', APPROVED_STRATEGY],
      ['campaigns', { data: [{ id: CAMP_ID, name: 'Summer Growth', status: 'DRAFT', created_at: '2026-01-01T00:00:00.000Z' }], error: null }],
      ['audit_logs', { data: null, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Summer Growth',
        objective: 'Drive demos',
        strategyId: STRATEGY_ID,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        budget: 25000,
        channels: ['meta_ads'],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ ok: true, campaignId: CAMP_ID });
    const insert = client.from.mock.calls.find((call) => call[0] === 'campaigns');
    expect(insert).toBeTruthy();
  });

  it('rejects an invalid campaign request with 400', async () => {
    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ name: '', strategyId: STRATEGY_ID }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the brand is not in the organization', async () => {
    const client = makeClient([['brands', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ name: 'Summer', strategyId: STRATEGY_ID }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(404);
  });

  it('returns 404 when the strategy does not exist', async () => {
    const client = makeClient([
      ['brands', BRAND],
      ['strategies', { data: null, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ name: 'Summer', strategyId: STRATEGY_ID }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(404);
  });

  it('returns 409 when the strategy is not approved (SUCCEEDED)', async () => {
    const client = makeClient([
      ['brands', BRAND],
      ['strategies', { data: { id: STRATEGY_ID, title: 'Running', version: 1, status: 'RUNNING' }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ name: 'Summer', strategyId: STRATEGY_ID }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(409);
  });

  it('returns 403 for a CLIENT role', async () => {
    mocks.requireOrgRole.mockResolvedValue({
      error: { status: 403, body: { error: 'Insufficient permissions' } },
      context: null,
    });
    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ name: 'Summer', strategyId: STRATEGY_ID }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 401, body: { error: 'Unauthorized' } }, context: null });
    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ name: 'Summer', strategyId: STRATEGY_ID }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/brands/[brandId]/campaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
  });

  it('returns campaigns with counts and approved strategies', async () => {
    const client = makeClient([
      ['brands', BRAND],
      [
        'campaigns',
        {
          data: [
            {
              id: CAMP_ID,
              name: 'Summer Growth',
              objective: 'Drive demos',
              description: null,
              status: 'DRAFT',
              start_date: null,
              end_date: null,
              budget: 25000,
              currency: 'USD',
              channels: ['meta_ads'],
              strategy_id: STRATEGY_ID,
              client_id: CLIENT_ID,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
              strategy: { id: STRATEGY_ID, title: 'Q1 Growth', version: 2, status: 'SUCCEEDED' },
            },
          ],
          error: null,
          count: 1,
        },
      ],
      ['content_items', { data: [{ campaign_id: CAMP_ID }], error: null }],
      ['strategies', { data: [{ id: STRATEGY_ID, title: 'Q1 Growth', version: 2, status: 'SUCCEEDED', created_at: '2026-01-01T00:00:00.000Z' }], error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands?limit=30&page=1'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0]).toMatchObject({
      id: CAMP_ID,
      status: 'DRAFT',
      currency: 'USD',
      budget: 25000,
      contentCount: 1,
      strategy: { id: STRATEGY_ID, title: 'Q1 Growth', version: 2 },
    });
    expect(body.strategyOptions).toEqual([{ id: STRATEGY_ID, title: 'Q1 Growth', version: 2, status: 'SUCCEEDED' }]);
    expect(body.canManage).toBe(true);
  });

  it('returns an empty list when brand has no campaigns', async () => {
    const client = makeClient([
      ['brands', BRAND],
      ['campaigns', { data: [], error: null, count: 0 }],
      ['content_items', { data: [], error: null }],
      ['strategies', { data: [], error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.campaigns).toEqual([]);
    expect(body.gate.hasApprovedStrategy).toBe(false);
  });

  it('returns 404 when the brand is missing', async () => {
    const client = makeClient([['brands', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(404);
  });
});