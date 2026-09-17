import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const RUN_ID = '00000000-0000-4000-8000-000000000004';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  scheduleResearchExecution: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({ requireOrgRole: mocks.requireOrgRole, CAN_RUN_RESEARCH: ['OWNER'], CAN_VIEW_DASHBOARD: ['OWNER'] }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock('@/lib/research/pipeline', () => ({ scheduleResearchExecution: mocks.scheduleResearchExecution }));

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
      return Promise.resolve({ data: queue.length === 0 ? null : undefined, error: null });
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
  return {
    from,
    queue: (table: string, payload: unknown) => {
      const existing = queues.get(table) ?? [];
      existing.push(payload);
      queues.set(table, existing);
    },
  };
}

const REQ = new NextRequest('http://localhost/api/brands', { method: 'POST' });

describe('POST /api/brands/[brandId]/research', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgRole.mockResolvedValue({ context: { organizationId: ORG_ID, userId: USER_ID, role: 'STRATEGIST' } });
  });

  it('starts a research run and schedules execution', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora', website_url: 'https://example.com/' }, error: null }],
      ['research_runs', { data: null, error: null }],
      ['research_runs', { data: { id: RUN_ID, status: 'QUEUED' }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(REQ, { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ ok: true, researchRunId: RUN_ID, status: 'QUEUED' });
    expect(mocks.scheduleResearchExecution).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'https://example.com/', researchRunId: RUN_ID }),
    );
  });

  it('returns 409 when a run is already active', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora', website_url: 'https://example.com/' }, error: null }],
      ['research_runs', { data: { id: RUN_ID, status: 'RUNNING' }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(REQ, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ researchRunId: RUN_ID, status: 'RUNNING' });
    expect(mocks.scheduleResearchExecution).not.toHaveBeenCalled();
  });

  it('returns 200 with an existing terminal run for a repeated idempotency key', async () => {
    const idempotencyKey = 'research-abc-123';
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora', website_url: 'https://example.com/' }, error: null }],
      ['research_runs', { data: { id: RUN_ID, status: 'COMPLETED' }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const req = new NextRequest('http://localhost/api/brands', { method: 'POST', body: JSON.stringify({ idempotencyKey }) });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ researchRunId: RUN_ID, status: 'COMPLETED' });
    expect(mocks.scheduleResearchExecution).not.toHaveBeenCalled();
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
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 401, body: { error: 'Unauthorized' } } });
    const res = await POST(REQ, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 when the role cannot run research', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 403, body: { error: 'Forbidden' } } });
    const res = await POST(REQ, { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/brands/[brandId]/research', () => {
  it('returns the run history with nested ai task info', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora', website_url: 'https://example.com/' }, error: null }],
      [
        'research_runs',
        {
          data: [
            {
              id: RUN_ID,
              status: 'COMPLETED',
              pages_processed: 2,
              pages_discovered: 4,
              error_code: null,
              error_message: null,
              created_at: '2026-01-01T00:00:00.000Z',
              started_at: '2026-01-01T00:00:01.000Z',
              finished_at: '2026-01-01T00:00:05.000Z',
              ai_tasks: [
                { research_run_id: RUN_ID, status: 'SUCCEEDED', provider: 'gemini', model: 'gemini-3.7-flash', error_message: null, created_at: '2026-01-01T00:00:03.000Z' },
              ],
            },
          ],
          error: null,
        },
      ],
    ]);
    mocks.requireOrgRole.mockResolvedValue({ context: { organizationId: ORG_ID, userId: USER_ID, role: 'STRATEGIST' } });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({
      id: RUN_ID,
      status: 'COMPLETED',
      pagesProcessed: 2,
      ai: { status: 'SUCCEEDED', provider: 'gemini', model: 'gemini-3.7-flash' },
    });
  });

  it('returns 404 when the brand is missing', async () => {
    const client = makeClient([['brands', { data: null, error: null }]]);
    mocks.requireOrgRole.mockResolvedValue({ context: { organizationId: ORG_ID, userId: USER_ID, role: 'STRATEGIST' } });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await GET(new NextRequest('http://localhost/api/brands'), { params: Promise.resolve({ brandId: BRAND_ID }) });
    expect(res.status).toBe(404);
  });
});