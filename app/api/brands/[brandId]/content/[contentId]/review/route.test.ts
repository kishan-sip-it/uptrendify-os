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
  CAN_GENERATE_CONTENT: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'],
  CAN_REVIEW_CONTENT: ['OWNER', 'ADMIN', 'STRATEGIST', 'APPROVER'],
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

function contentRow(status: string) {
  return { data: { id: CONTENT_ID, title: 'Win back ICP accounts', status, current_version_id: VERSION_ID }, error: null };
}

function actQueues(status: string, nextStatus?: string): Array<[string, unknown]> {
  const next = nextStatus ?? (status === 'IN_REVIEW' ? 'APPROVED' : 'IN_REVIEW');
  return [
    ['content_items', contentRow(status)],
    ['content_items', { data: { id: CONTENT_ID, status: next }, error: null }],
    ['content_reviews', { data: [{ id: 'review-1' }], error: null }],
    ['audit_logs', { data: null, error: null }],
  ];
}

describe('POST /api/brands/[brandId]/content/[contentId]/review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approves content in review and records the decision', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'APPROVER', userId: USER_ID } });
    const client = makeClient(actQueues('IN_REVIEW'));
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(new NextRequest('http://localhost/api/review', { method: 'POST', body: JSON.stringify({ action: 'approve', comment: 'Tone is on brand' }) }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: 'APPROVED' });
    expect(mocks.requireOrgRole).toHaveBeenCalledWith(expect.arrayContaining(['OWNER', 'APPROVER']));
  });

  it('rejects content and moves it to REJECTED', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'APPROVER', userId: USER_ID } });
    const client = makeClient(actQueues('IN_REVIEW'));
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(new NextRequest('http://localhost/api/review', { method: 'POST', body: JSON.stringify({ action: 'reject', comment: 'Wrong channel' }) }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'REJECTED' });
  });

  it('allows an editor to submit a draft for review', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'EDITOR', userId: USER_ID } });
    const client = makeClient(actQueues('DRAFT'));
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(new NextRequest('http://localhost/api/review', { method: 'POST', body: JSON.stringify({ action: 'submit' }) }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'IN_REVIEW' });
  });

  it('requires a generated version before submitting a draft for review', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'EDITOR', userId: USER_ID } });
    const client = makeClient([
      ['content_items', { data: { id: CONTENT_ID, title: 'Win back ICP accounts', status: 'DRAFT', current_version_id: null }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(new NextRequest('http://localhost/api/review', {
      method: 'POST',
      body: JSON.stringify({ action: 'submit' }),
    }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(409);
  });

  it('blocks an invalid transition with 409', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'APPROVER', userId: USER_ID } });
    const client = makeClient([['content_items', contentRow('DRAFT')]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(new NextRequest('http://localhost/api/review', { method: 'POST', body: JSON.stringify({ action: 'approve' }) }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(409);
  });

  it('keeps APPROVED restricted to queueing, archiving and returning to draft', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'APPROVER', userId: USER_ID } });
    for (const action of ['reject', 'changes_requested']) {
      const client = makeClient([['content_items', contentRow('APPROVED')]]);
      mocks.createSupabaseServerClient.mockResolvedValue(client);

      const res = await POST(new NextRequest('http://localhost/api/review', {
        method: 'POST',
        body: JSON.stringify({ action }),
      }), {
        params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
      });
      expect(res.status).toBe(409);
    }
  });

  it('returns an APPROVED item to draft and pins the decision to the exact version', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'APPROVER', userId: USER_ID } });
    const client = makeClient(actQueues('APPROVED', 'DRAFT'));
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(new NextRequest('http://localhost/api/review', {
      method: 'POST',
      body: JSON.stringify({ action: 'return_to_draft' }),
    }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'DRAFT' });
    const reviewInsert = client.inserts.find((entry) => entry.table === 'content_reviews');
    expect((reviewInsert!.payload as { decision: string }).decision).toBe('return_to_draft');
    expect((reviewInsert!.payload as { content_version_id: string }).content_version_id).toBe(VERSION_ID);
  });

  it('requires the reviewer role for approve', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 403, body: { error: 'Forbidden' } }, context: null });

    const res = await POST(new NextRequest('http://localhost/api/review', { method: 'POST', body: JSON.stringify({ action: 'approve' }) }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(403);
  });

  it('returns 404 when the content item is not in the brand', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'APPROVER', userId: USER_ID } });
    const client = makeClient([['content_items', { data: null, error: null }]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(new NextRequest('http://localhost/api/review', { method: 'POST', body: JSON.stringify({ action: 'approve' }) }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(404);
  });

  it('queues an approved item for publishing and pins the decision to the exact version', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'APPROVER', userId: USER_ID } });
    const client = makeClient(actQueues('APPROVED', 'READY_TO_PUBLISH'));
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(new NextRequest('http://localhost/api/review', {
      method: 'POST',
      body: JSON.stringify({ action: 'queue_for_publish', comment: 'Ready for the client channel' }),
    }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'READY_TO_PUBLISH' });
    const reviewInsert = client.inserts.find((entry) => entry.table === 'content_reviews');
    expect(reviewInsert).toBeDefined();
    expect((reviewInsert!.payload as { decision: string; content_version_id: string }).decision).toBe('queue_for_publish');
    expect((reviewInsert!.payload as { content_version_id: string }).content_version_id).toBe(VERSION_ID);
    expect((reviewInsert!.payload as { organization_id: string }).organization_id).toBe(ORG_ID);
  });

  it('returns a queued item back to APPROVED', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'APPROVER', userId: USER_ID } });
    const client = makeClient(actQueues('READY_TO_PUBLISH', 'APPROVED'));
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(new NextRequest('http://localhost/api/review', {
      method: 'POST',
      body: JSON.stringify({ action: 'back_to_approved' }),
    }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'APPROVED' });
  });

  it('requires the reviewer role to queue an item for publishing', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 403, body: { error: 'Forbidden' } }, context: null });

    const res = await POST(new NextRequest('http://localhost/api/review', {
      method: 'POST',
      body: JSON.stringify({ action: 'queue_for_publish' }),
    }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(403);
    expect(mocks.requireOrgRole).toHaveBeenCalledWith(expect.arrayContaining(['APPROVER']));
  });

  it('blocks queuing for publish from a non-approved state', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'APPROVER', userId: USER_ID } });
    const client = makeClient([['content_items', contentRow('IN_REVIEW')]]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(new NextRequest('http://localhost/api/review', {
      method: 'POST',
      body: JSON.stringify({ action: 'queue_for_publish' }),
    }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(409);
  });

  it('validates the action enum with 400', async () => {
    const res = await POST(new NextRequest('http://localhost/api/review', { method: 'POST', body: JSON.stringify({ action: 'nuke-it' }) }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(res.status).toBe(400);
  });
});
