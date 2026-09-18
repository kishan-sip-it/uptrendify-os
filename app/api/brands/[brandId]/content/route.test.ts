import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const CONTENT_ID = '00000000-0000-4000-8000-000000000004';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireOrgRole: mocks.requireOrgRole,
  CAN_GENERATE_CONTENT: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'],
  CAN_REVIEW_CONTENT: ['OWNER', 'ADMIN', 'STRATEGIST', 'APPROVER'],
  CAN_VIEW_CONTENT: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'],
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

const BRAND = { data: { id: BRAND_ID, name: 'Aurora Labs' }, error: null };

describe('POST /api/brands/[brandId]/content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
  });

  it('creates a draft content item from a valid brief', async () => {
    const client = makeClient([
      ['brands', BRAND],
      ['content_items', { data: [{ id: CONTENT_ID, type: 'social_post', title: 'Win back ICP accounts', status: 'DRAFT', channel: 'linkedin', created_at: '2026-01-01T00:00:00.000Z' }], error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ type: 'social_post', channel: 'linkedin', title: 'Win back ICP accounts' }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ ok: true, contentId: CONTENT_ID });
  });

  it('rejects an invalid brief with 400', async () => {
    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ type: 'not-a-type', channel: 'linkedin', title: 'x' }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the brand is not in the organization', async () => {
    const client = makeClient([['brands', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ type: 'email', channel: 'email', title: 'x' }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 401, body: { error: 'Unauthorized' } }, context: null });
    const req = new NextRequest('http://localhost/api/brands', {
      method: 'POST',
      body: JSON.stringify({ type: 'email', channel: 'email', title: 'x' }),
    });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/brands/[brandId]/content', () => {
  it('returns items with the generation gate', async () => {
    const client = makeClient([
      ['brands', BRAND],
      ['content_items', { data: [], error: null, count: 0 }],
      ['brands', BRAND],
      ['brand_facts', { data: [], error: null }],
      ['brand_insights', { data: [], error: null }],
      ['brand_sources', { data: [], error: null }],
      ['research_runs', { data: [], error: null }],
      ['strategies', { data: null, error: null }],
      ['brand_suggestions', { data: [], error: null }],
    ]);
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands?limit=30&page=1'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([]);
    expect(body.gate.ok).toBe(false);
    expect(body.gate.code).toBe('INSUFFICIENT_BRAIN');
    expect(body.canGenerate).toBe(true);
  });

  it('includes items when the brain and strategy are ready', async () => {
    const client = makeClient([
      ['brands', BRAND],
      [
        'content_items',
        {
          data: [
            { id: CONTENT_ID, type: 'social_post', title: 'Win back ICP accounts', status: 'DRAFT', channel: 'linkedin', topic: null, objective: null, client_id: null, current_version_id: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
          ],
          error: null,
          count: 1,
        },
      ],
      ['brands', BRAND],
      ['brand_facts', { data: [], error: null }],
      ['brand_insights', { data: [], error: null }],
      ['brand_sources', { data: [], error: null }],
      ['research_runs', { data: [], error: null }],
      ['strategies', { data: null, error: null }],
      ['brand_suggestions', { data: [], error: null }],
    ]);
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: CONTENT_ID, title: 'Win back ICP accounts', status: 'DRAFT', versionCount: 0 });
  });

  it('returns 404 when the brand is missing', async () => {
    const client = makeClient([['brands', { data: null, error: null }]]);
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(404);
  });
});