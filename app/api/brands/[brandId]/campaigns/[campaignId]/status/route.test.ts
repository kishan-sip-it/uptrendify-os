import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

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
  objective: null,
  description: null,
  status: 'DRAFT',
  start_date: null,
  end_date: null,
  budget: null,
  currency: 'USD',
  channels: [],
  strategy_id: STRATEGY_ID,
  client_id: CLIENT_ID,
  created_by: USER_ID,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  strategy: { id: STRATEGY_ID, title: 'Q1 Growth', version: 2, status: 'SUCCEEDED', output: null },
};

describe('POST /api/brands/[brandId]/campaigns/[campaignId]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
  });

  it('moves a DRAFT campaign to PLANNED', async () => {
    const client = makeClient([
      ['campaigns', { data: CAMPAIGN_ROW, error: null }],
      ['campaigns', { data: { id: CAMP_ID, status: 'PLANNED' }, error: null }],
      ['audit_logs', { data: null, error: null }],
      ['campaigns', { data: { ...CAMPAIGN_ROW, status: 'PLANNED' }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ action: 'plan' }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.campaign.status).toBe('PLANNED');
  });

  it('returns 409 for an action that is invalid from the current status', async () => {
    const client = makeClient([['campaigns', { data: CAMPAIGN_ROW, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ action: 'activate' }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.allowedActions).toContain('plan');
  });

  it('returns 409 on a concurrent status change', async () => {
    const client = makeClient([
      ['campaigns', { data: CAMPAIGN_ROW, error: null }],
      ['campaigns', { data: null, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ action: 'plan' }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    expect(res.status).toBe(409);
  });

  it('returns 400 for an unknown action', async () => {
    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ action: 'warp' }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the campaign is missing', async () => {
    const client = makeClient([['campaigns', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ action: 'plan' }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 401, body: { error: 'Unauthorized' } }, context: null });
    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ action: 'plan' }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID, campaignId: CAMP_ID }) });
    expect(res.status).toBe(401);
  });
});