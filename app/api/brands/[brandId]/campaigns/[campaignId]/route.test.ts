import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const CLIENT_ID = '00000000-0000-4000-8000-000000000004';
const STRATEGY_ID = '00000000-0000-4000-8000-000000000005';
const CAMP_ID = '00000000-0000-4000-8000-000000000006';
const CONTENT_ID = '00000000-0000-4000-8000-000000000007';

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

const CAMPAIGN_ROW = {
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
  created_by: USER_ID,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  strategy: { id: STRATEGY_ID, title: 'Q1 Growth', version: 2, status: 'SUCCEEDED', output: { objectives: [{ objective: 'Win back ICP' }], channels: [{}], kpis: { traffic: ['x'] } } },
};

describe('GET /api/brands/[brandId]/campaigns/[campaignId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
  });

  it('returns campaign detail with related content and strategy summary', async () => {
    const client = makeClient([
      ['campaigns', { data: CAMPAIGN_ROW, error: null }],
      [
        'content_items',
        {
          data: [
            { id: CONTENT_ID, type: 'social_post', title: 'Win back post', status: 'DRAFT', channel: 'linkedin', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
          ],
          error: null,
        },
      ],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.campaign).toMatchObject({ id: CAMP_ID, name: 'Summer Growth', status: 'DRAFT' });
    expect(body.campaign.strategy).toMatchObject({ id: STRATEGY_ID, title: 'Q1 Growth', version: 2 });
    expect(body.campaign.strategy.outputSummary.objectives).toEqual(['Win back ICP']);
    expect(body.content).toHaveLength(1);
    expect(body.content[0]).toMatchObject({ id: CONTENT_ID, title: 'Win back post' });
    expect(body.canManage).toBe(true);
  });

  it('returns 404 when the campaign is not in the organization', async () => {
    const client = makeClient([['campaigns', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 401, body: { error: 'Unauthorized' } }, context: null });
    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/brands/[brandId]/campaigns/[campaignId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
  });

  it('updates campaign planning fields', async () => {
    const updatedRow = { ...CAMPAIGN_ROW, budget: 30000, name: 'Summer Growth v2' };
    const client = makeClient([
      ['campaigns', { data: CAMPAIGN_ROW, error: null }],
      ['campaigns', { data: null, error: null }],
      ['audit_logs', { data: null, error: null }],
      ['campaigns', { data: updatedRow, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Summer Growth v2', budget: 30000 }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.campaign.name).toBe('Summer Growth v2');
    expect(client.from.mock.calls.some((call) => call[0] === 'audit_logs')).toBe(true);
  });

  it('rejects an empty update body with 400', async () => {
    const client = makeClient([['campaigns', { data: CAMPAIGN_ROW, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid update body with 400', async () => {
    const req = new NextRequest('http://localhost/api/brands', {
      method: 'PATCH',
      body: JSON.stringify({ budget: -5 }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    expect(res.status).toBe(400);
  });

  it('rejects a strategy that is not approved with 409', async () => {
    const client = makeClient([
      ['campaigns', { data: CAMPAIGN_ROW, error: null }],
      ['strategies', { data: { id: STRATEGY_ID, title: 'Running', version: 1, status: 'RUNNING' }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'PATCH',
      body: JSON.stringify({ strategyId: STRATEGY_ID }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    expect(res.status).toBe(409);
  });

  it('rejects an endDate earlier than the existing startDate with 400', async () => {
    const row = { ...CAMPAIGN_ROW, start_date: '2026-06-01', end_date: '2026-06-30' };
    const client = makeClient([['campaigns', { data: row, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'PATCH',
      body: JSON.stringify({ endDate: '2026-05-01' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('End date must be on or after the start date');
  });

  it('rejects a startDate later than the existing endDate with 400', async () => {
    const row = { ...CAMPAIGN_ROW, start_date: null, end_date: '2026-06-30' };
    const client = makeClient([['campaigns', { data: row, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'PATCH',
      body: JSON.stringify({ startDate: '2026-07-01' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });

    expect(res.status).toBe(400);
  });

  it('accepts a single-field date update that keeps a valid merged range', async () => {
    const updatedRow = { ...CAMPAIGN_ROW, start_date: '2026-06-01', end_date: '2026-06-15' };
    const client = makeClient([
      ['campaigns', { data: { ...CAMPAIGN_ROW, start_date: '2026-06-01', end_date: '2026-06-30' }, error: null }],
      ['campaigns', { data: null, error: null }],
      ['audit_logs', { data: null, error: null }],
      ['campaigns', { data: updatedRow, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'PATCH',
      body: JSON.stringify({ endDate: '2026-06-15' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.campaign.endDate).toBe('2026-06-15');
  });

  it('returns 404 when the campaign is missing', async () => {
    const client = makeClient([['campaigns', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'x' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    expect(res.status).toBe(404);
  });

  it('returns 403 for a CLIENT role', async () => {
    mocks.requireOrgRole.mockResolvedValue({
      error: { status: 403, body: { error: 'Insufficient permissions' } },
      context: null,
    });
    const req = new NextRequest('http://localhost/api/brands', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'x' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    expect(res.status).toBe(403);
  });
});