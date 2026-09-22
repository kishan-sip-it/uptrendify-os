import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const USER_ID = '00000000-0000-4000-8000-000000000002';
const ORG_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireOrgRole: mocks.requireOrgRole,
  CAN_INVITE_MEMBERS: ['OWNER', 'ADMIN'],
  CAN_MANAGE_MEMBERS: ['OWNER', 'ADMIN'],
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

function makeClient(options: { rpcResult?: unknown; rpcError?: { message: string } | null }) {
  const client: any = {
    rpc: vi.fn(async () => ({ data: options.rpcResult ?? null, error: options.rpcError ?? null })),
  };
  return client;
}

function authContext(role: string) {
  return { error: null, context: { organizationId: ORG_ID, role, userId: USER_ID } };
}

function inviteRequest(email: string, role: string) {
  return new NextRequest('http://localhost/api/team/invitations', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

describe('POST /api/team/invitations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an invitation through the RPC for owners and admins', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('OWNER'));
    const client = makeClient({
      rpcResult: [{ id: 'inv-1', invited_email: 'new@agency.com', role: 'EDITOR', invited_by: USER_ID, expires_at: '2026-09-29T00:00:00Z', created_at: '2026-09-22T00:00:00Z' }],
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(inviteRequest('new@agency.com', 'EDITOR'));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true, invitation: { invited_email: 'new@agency.com' } });
    expect(client.rpc).toHaveBeenCalledWith('invite_organization_member', {
      p_organization_id: ORG_ID,
      p_email: 'new@agency.com',
      p_role: 'EDITOR',
    });
  });

  it('rejects non-manager roles before hitting the RPC', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 403, body: { error: 'Forbidden' } }, context: null });

    const response = await POST(inviteRequest('new@agency.com', 'EDITOR'));
    expect(response.status).toBe(403);
  });

  it('maps ALREADY_A_MEMBER to a 409 conflict', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('ADMIN'));
    const client = makeClient({ rpcError: { message: 'ALREADY_A_MEMBER' } });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(inviteRequest('existing@agency.com', 'EDITOR'));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('already a member') });
  });

  it('maps PENDING_INVITE_EXISTS to a 409 conflict', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('OWNER'));
    const client = makeClient({ rpcError: { message: 'PENDING_INVITE_EXISTS' } });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(inviteRequest('pending@agency.com', 'EDITOR'));
    expect(response.status).toBe(409);
  });

  it('rejects invalid emails and disallowed roles', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('OWNER'));
    const client = makeClient({ rpcResult: null });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const badEmail = await POST(inviteRequest('not-an-email', 'EDITOR'));
    expect(badEmail.status).toBe(400);

    const ownerRole = await POST(inviteRequest('owner@agency.com', 'OWNER'));
    expect(ownerRole.status).toBe(400);

    expect(client.rpc).not.toHaveBeenCalled();
  });
});