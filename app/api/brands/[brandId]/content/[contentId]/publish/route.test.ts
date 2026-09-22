import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const CONTENT_ID = '00000000-0000-4000-8000-000000000004';
const VERSION_ID = '00000000-0000-4000-8000-000000000006';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireOrgRole: mocks.requireOrgRole,
  CAN_PUBLISH_CONTENT: ['OWNER', 'ADMIN', 'STRATEGIST'],
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
  const inserts: Array<{ table: string; payload: unknown }> = [];

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
        if (name === 'insert') {
          return (payload: unknown) => {
            inserts.push({ table, payload });
            return chain(table);
          };
        }
        return () => chain(table);
      },
    });
    return proxy;
  };

  const from = vi.fn((table: string) => chain(String(table)));
  return { from, inserts };
}

function brandRow() {
  return { data: { id: BRAND_ID, name: 'Acme', client_id: null }, error: null };
}

function itemRow(status: string) {
  return {
    data: { id: CONTENT_ID, title: 'Q3 winback', status, channel: 'linkedin', client_id: null, campaign_id: null, current_version_id: VERSION_ID },
    error: null,
  };
}

function versionRow() {
  return { data: { id: VERSION_ID, version: 2, headline: 'Win back ICP accounts', body: 'Full body', content_item_id: CONTENT_ID }, error: null };
}

function baseQueues(status: string): Array<[string, unknown]> {
  return [
    ['brands', brandRow()],
    ['content_items', itemRow(status)],
    ['content_versions', versionRow()],
  ];
}

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/publish', { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
  });
}

describe('POST /api/brands/[brandId]/content/[contentId]/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires the publisher role', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 403, body: { error: 'Forbidden' } }, context: null });

    const res = await post({});
    expect(res.status).toBe(403);
    expect(mocks.requireOrgRole).toHaveBeenCalledWith(expect.arrayContaining(['OWNER', 'ADMIN', 'STRATEGIST']));
  });

  it('returns 404 when the brand does not belong to the organization (wrong tenant)', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'STRATEGIST', userId: USER_ID } });
    const client = makeClient([['brands', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await post({ channel: 'linkedin' });
    expect(res.status).toBe(404);
  });

  it('returns 404 when the content item does not exist for the tenant', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'STRATEGIST', userId: USER_ID } });
    const client = makeClient([
      ['brands', brandRow()],
      ['content_items', { data: null, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await post({ channel: 'linkedin' });
    expect(res.status).toBe(404);
  });

  it('rejects publishing content that is not approved and queued', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'STRATEGIST', userId: USER_ID } });
    const client = makeClient([...baseQueues('APPROVED'), ['content_publications', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await post({ channel: 'linkedin' });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe('NOT_READY_TO_PUBLISH');
  });

  it('rejects publishing content that was never approved (DRAFT)', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'STRATEGIST', userId: USER_ID } });
    const client = makeClient([...baseQueues('DRAFT'), ['content_publications', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await post({ channel: 'linkedin' });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe('NOT_READY_TO_PUBLISH');
  });

  it('returns a clean NOT_CONNECTED and records the attempt when the channel has no configuration', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'STRATEGIST', userId: USER_ID } });
    const client = makeClient([
      ...baseQueues('READY_TO_PUBLISH'),
      ['content_publications', { data: null, error: null }],
      ['channel_configurations', { data: null, error: null }],
      ['content_publications', { data: { id: 'pub-1' }, error: null }],
      ['audit_logs', { data: null, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await post({ channel: 'linkedin' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ published: false, status: 'NOT_CONNECTED', channel: 'linkedin', errorCode: 'CHANNEL_NOT_CONNECTED' });

    const attempt = client.inserts.find((entry) => entry.table === 'content_publications');
    expect(attempt).toBeDefined();
    const payload = attempt!.payload as Record<string, unknown>;
    expect(payload.status).toBe('NOT_CONNECTED');
    expect(payload.content_version_id).toBe(VERSION_ID);
    expect(payload.initiated_by).toBe(USER_ID);
  });

  it('returns NOT_CONNECTED when the channel configuration is not connected', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'ADMIN', userId: USER_ID } });
    const client = makeClient([
      ...baseQueues('READY_TO_PUBLISH'),
      ['content_publications', { data: null, error: null }],
      ['channel_configurations', { data: { id: 'cfg-1', channel: 'linkedin', status: 'NOT_CONFIGURED' }, error: null }],
      ['content_publications', { data: { id: 'pub-2' }, error: null }],
      ['audit_logs', { data: null, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await post({ channel: 'linkedin' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ published: false, status: 'NOT_CONNECTED' });
  });

  it('prevents a duplicate publish of the same version and channel', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'STRATEGIST', userId: USER_ID } });
    const client = makeClient([
      ...baseQueues('READY_TO_PUBLISH'),
      ['content_publications', { data: { id: 'pub-old' }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await post({ channel: 'linkedin' });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe('ALREADY_PUBLISHED');
  });

  it('deduplicates repeated requests that share an idempotency key', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'STRATEGIST', userId: USER_ID } });
    const client = makeClient([
      ...baseQueues('READY_TO_PUBLISH'),
      [
        'content_publications',
        { data: { id: 'dup-1', channel: 'linkedin', status: 'SUCCEEDED', error_code: null, error_message: null }, error: null },
      ],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await post({ channel: 'linkedin', idempotencyKey: 'pub:linkedin:v2' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ published: true, status: 'SUCCEEDED', deduplicated: true });
  });
});