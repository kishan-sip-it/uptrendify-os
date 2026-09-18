import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const CONTENT_ID = '00000000-0000-4000-8000-000000000004';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  scheduleContentExecution: vi.fn(),
  completeReplayContentGeneration: vi.fn(),
  isReplayOrganization: vi.fn(),
  loadContentSnapshot: vi.fn(),
  evaluateContentGate: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireOrgRole: mocks.requireOrgRole,
  CAN_GENERATE_CONTENT: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'],
}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock('@/lib/content/pipeline', () => ({
  scheduleContentExecution: mocks.scheduleContentExecution,
  CONTENT_TASK_TYPE: 'content_generation',
}));
vi.mock('@/lib/replay', () => ({
  completeReplayContentGeneration: mocks.completeReplayContentGeneration,
  isReplayOrganization: mocks.isReplayOrganization,
}));
vi.mock('@/lib/content/context', () => ({
  loadContentSnapshot: mocks.loadContentSnapshot,
  evaluateContentGate: mocks.evaluateContentGate,
}));

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

function authContext() {
  return { context: { organizationId: ORG_ID, role: 'STRATEGIST', userId: USER_ID } };
}

const ITEM = {
  data: {
    id: CONTENT_ID,
    type: 'social_post',
    title: 'Win back ICP accounts',
    status: 'DRAFT',
    channel: 'linkedin',
    objective: 'Drive demos',
    audience: 'Fractional CMOs',
    tone: 'confident',
    cta: 'Book a demo',
    instructions: null,
    context: { campaignContext: 'Q3' },
  },
  error: null,
};

const OPEN_GATE = {
  ok: true,
  code: null,
  message: '',
  counts: { suggestions: 4, approved: 4, missing: [] },
  strategy: { ready: true, version: 2 },
};

function snapshotQueues(): Array<[string, unknown]> {
  return [
    ['brands', { data: { id: BRAND_ID, name: 'Aurora Labs', client_id: null }, error: null }],
    ['content_items', ITEM],
    ['ai_tasks', { data: null, error: null }],
  ];
}

describe('POST /api/brands/[brandId]/content/[contentId]/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgRole.mockResolvedValue({ error: null, ...authContext() });
    mocks.isReplayOrganization.mockResolvedValue(false);
  });

  it('schedules content execution when the gate is open', async () => {
    const client = makeClient(snapshotQueues());
    mocks.createSupabaseServerClient.mockResolvedValue(client);
    mocks.loadContentSnapshot.mockResolvedValue({ suggestionRows: [] });
    mocks.evaluateContentGate.mockReturnValue(OPEN_GATE);

    const res = await POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ ok: true, status: 'RUNNING' });
    expect(mocks.scheduleContentExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        brandId: BRAND_ID,
        contentId: CONTENT_ID,
        createdBy: USER_ID,
        intent: expect.objectContaining({ type: 'social_post', channel: 'linkedin' }),
      }),
    );
  });

  it('returns 422 when the brand brain gate is closed', async () => {
    const client = makeClient(snapshotQueues());
    mocks.createSupabaseServerClient.mockResolvedValue(client);
    mocks.loadContentSnapshot.mockResolvedValue({ suggestionRows: [] });
    mocks.evaluateContentGate.mockReturnValue({
      ok: false,
      code: 'INSUFFICIENT_APPROVED_BRAIN',
      message: 'Approve the Brand Brain first.',
      counts: { suggestions: 4, approved: 2, missing: ['brand_name'] },
      strategy: { ready: false, version: null },
    });

    const res = await POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.gate).toMatchObject({ ok: false, code: 'INSUFFICIENT_APPROVED_BRAIN' });
    expect(mocks.completeReplayContentGeneration).not.toHaveBeenCalled();
    expect(mocks.scheduleContentExecution).not.toHaveBeenCalled();
  });

  it('returns 409 when a generation is already running for the content item', async () => {
    const [brands, item] = snapshotQueues();
    const client = makeClient([
      brands,
      item,
      ['ai_tasks', { data: { id: 'task-1', status: 'RUNNING' }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);
    mocks.loadContentSnapshot.mockResolvedValue({ suggestionRows: [] });
    mocks.evaluateContentGate.mockReturnValue(OPEN_GATE);

    const res = await POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });

    expect(res.status).toBe(409);
    expect(mocks.scheduleContentExecution).not.toHaveBeenCalled();
  });

  it('replays content generation for the replay organization', async () => {
    const client = makeClient([
      ...snapshotQueues(),
      ['ai_tasks', { data: { id: 'replay-task' }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);
    mocks.isReplayOrganization.mockResolvedValue(true);
    mocks.loadContentSnapshot.mockResolvedValue({ suggestionRows: [] });
    mocks.evaluateContentGate.mockReturnValue(OPEN_GATE);
    mocks.completeReplayContentGeneration.mockResolvedValue({ status: 'SUCCEEDED', version: 1 });

    const res = await POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ ok: true, status: 'SUCCEEDED', version: 1, replay: true });
    expect(mocks.completeReplayContentGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ contentId: CONTENT_ID, aiTaskId: 'replay-task', intent: expect.objectContaining({ channel: 'linkedin' }) }),
    );
    expect(mocks.scheduleContentExecution).not.toHaveBeenCalled();
  });

  it('returns 404 when the content item is not in the brand', async () => {
    const client = makeClient([
      ['brands', { data: { id: BRAND_ID, name: 'Aurora Labs', client_id: null }, error: null }],
      ['content_items', { data: null, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it('honors an existing idempotency key', async () => {
    const client = makeClient([
      ...snapshotQueues(),
      ['ai_tasks', { data: { id: 'task-prior', status: 'SUCCEEDED', output_metadata: { version: 2 }, provider: 'replay', model: 'fixture', error_code: null, error_message: null }, error: null }],
    ]);
    mocks.createSupabaseServerClient.mockResolvedValue(client);
    mocks.loadContentSnapshot.mockResolvedValue({ suggestionRows: [] });
    mocks.evaluateContentGate.mockReturnValue(OPEN_GATE);

    const req = new NextRequest('http://localhost/api/generate', { method: 'POST', body: JSON.stringify({ idempotencyKey: 'content-gen-abc-1234' }) });
    const res = await POST(req, { params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ version: 2, status: 'SUCCEEDED' });
    expect(mocks.scheduleContentExecution).not.toHaveBeenCalled();
  });
});