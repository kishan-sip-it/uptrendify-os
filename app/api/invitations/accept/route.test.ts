import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const USER_ID = '00000000-0000-4000-8000-000000000002';
const ORG_ID = '00000000-0000-4000-8000-000000000001';
const TOKEN = 'abcdef0123456789abcdef0123456789abcdef0123456789';

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

function makeClient(options: {
  rpcResult?: unknown;
  rpcError?: { message: string } | null;
  user?: object | null;
}) {
  const client: any = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: options.user === undefined ? { id: USER_ID } : options.user }, error: null })),
    },
    rpc: vi.fn(async () => ({ data: options.rpcResult ?? null, error: options.rpcError ?? null })),
  };
  return client;
}

function getRequest(token: string | null) {
  return new NextRequest(`http://localhost/api/invitations/accept${token ? `?token=${token}` : ''}`);
}

describe('GET /api/invitations/accept', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a pending invitation with a friendlier shape', async () => {
    const client = makeClient({
      rpcResult: [
        {
          invited_email: 'new@agency.com',
          role: 'EDITOR',
          organization_name: 'Aurora Labs',
          accepted_at: null,
          revoked_at: null,
          expires_at: '2026-09-29T00:00:00Z',
        },
      ],
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await GET(getRequest(TOKEN));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invitation).toMatchObject({ invitedEmail: 'new@agency.com', role: 'EDITOR', organizationName: 'Aurora Labs', status: 'PENDING' });
  });

  it('reports already-accepted invitations instead of leaking the token', async () => {
    const client = makeClient({
      rpcResult: [
        { invited_email: 'new@agency.com', role: 'EDITOR', organization_name: 'Aurora Labs', accepted_at: '2026-09-21T00:00:00Z', revoked_at: null, expires_at: null },
      ],
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await GET(getRequest(TOKEN));
    expect((await response.json()).invitation.status).toBe('ACCEPTED');
  });

  it('returns 404 for unknown tokens and 400 for malformed ones', async () => {
    const client = makeClient({ rpcResult: [] });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const notFound = await GET(getRequest(TOKEN));
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toMatchObject({ code: 'INVITATION_NOT_FOUND' });

    const malformed = await GET(getRequest('short'));
    expect(malformed.status).toBe(400);
  });
});

describe('POST /api/invitations/accept', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a valid invitation and sets the org switch cookie', async () => {
    const client = makeClient({ rpcResult: [{ organization_id: ORG_ID, role: 'EDITOR', organization_name: 'Aurora Labs' }] });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(new NextRequest('http://localhost/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token: TOKEN }) }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.organization).toMatchObject({ id: ORG_ID, role: 'EDITOR' });

    const cookie = response.cookies.get('uptrendify_org');
    expect(cookie?.value).toBe(ORG_ID);
  });

  it('rejects requests without a signed-in user', async () => {
    const client = makeClient({ rpcResult: [{ organization_id: ORG_ID, role: 'EDITOR' }], user: null });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(new NextRequest('http://localhost/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token: TOKEN }) }));
    expect(response.status).toBe(401);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('maps invitation lifecycle errors to specific statuses', async () => {
    const expiry = makeClient({ rpcError: { message: 'INVITATION_EXPIRED (SQLSTATE P0001)' } });
    mocks.createSupabaseServerClient.mockResolvedValue(expiry);
    const response = await POST(new NextRequest('http://localhost/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token: TOKEN }) }));
    expect(response.status).toBe(410);

    vi.clearAllMocks();
    const accepted = makeClient({ rpcError: { message: 'INVITATION_ALREADY_ACCEPTED (SQLSTATE P0001)' } });
    mocks.createSupabaseServerClient.mockResolvedValue(accepted);
    const spent = await POST(new NextRequest('http://localhost/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token: TOKEN }) }));
    expect(spent.status).toBe(410);

    vi.clearAllMocks();
    const mismatch = makeClient({ rpcError: { message: 'INVITATION_EMAIL_MISMATCH (SQLSTATE P0001)' } });
    mocks.createSupabaseServerClient.mockResolvedValue(mismatch);
    const forbidden = await POST(new NextRequest('http://localhost/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token: TOKEN }) }));
    expect(forbidden.status).toBe(403);
  });
});