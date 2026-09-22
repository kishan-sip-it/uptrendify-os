import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const USER_ID = '00000000-0000-4000-8000-000000000002';
const ORG_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireOrgRole: mocks.requireOrgRole,
  CAN_VIEW_TEAM: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'],
  CAN_MANAGE_MEMBERS: ['OWNER', 'ADMIN'],
  CAN_INVITE_MEMBERS: ['OWNER', 'ADMIN'],
  CAN_UPDATE_MEMBER_ROLE: ['OWNER', 'ADMIN'],
  CAN_REMOVE_MEMBER: ['OWNER', 'ADMIN'],
  INVITABLE_ROLES: ['ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'],
  ASSIGNABLE_ROLES_BY_ROLE: {
    OWNER: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'],
    ADMIN: ['ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'],
    STRATEGIST: [],
    EDITOR: [],
    APPROVER: [],
    CLIENT: [],
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

function makeClient(options: { rpcResult?: unknown; rpcError?: { message: string } | null; invitations?: unknown[] }) {
  const invitationChain: any = {
    select: () => invitationChain,
    eq: () => invitationChain,
    order: () => Promise.resolve({ data: options.invitations ?? [], error: null }),
  };
  const client: any = {
    rpc: vi.fn(async () => ({ data: options.rpcResult ?? [], error: options.rpcError ?? null })),
    from: vi.fn(() => invitationChain),
  };
  return client;
}

function authContext(role: string) {
  return { error: null, context: { organizationId: ORG_ID, role, userId: USER_ID } };
}

describe('GET /api/team', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns members for any member role without exposing invitations to non-managers', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('EDITOR'));
    const client = makeClient({
      rpcResult: [
        { user_id: USER_ID, email: 'editor@agency.com', first_name: 'Ava', last_name: null, role: 'EDITOR', joined_at: '2026-01-01T00:00:00Z' },
      ],
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.members).toHaveLength(1);
    expect(body.members[0].email).toBe('editor@agency.com');
    expect(body.invitations).toEqual([]);
    expect(client.rpc).toHaveBeenCalledWith('list_organization_members_with_email', { p_organization_id: ORG_ID });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('includes pending invitations and management permissions for owners and admins', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('OWNER'));
    const client = makeClient({
      rpcResult: [
        { user_id: USER_ID, email: 'owner@agency.com', first_name: null, last_name: null, role: 'OWNER', joined_at: '2026-01-01T00:00:00Z' },
      ],
      invitations: [{ id: 'inv-1', invited_email: 'new@agency.com', role: 'EDITOR' }],
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invitations).toEqual([{ id: 'inv-1', invited_email: 'new@agency.com', role: 'EDITOR' }]);
    expect(body.permissions.canInviteMembers).toBe(true);
    expect(body.permissions.assignableRoles).toContain('OWNER');
  });

  it('rejects unauthenticated and unauthorized callers', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 403, body: { error: 'Forbidden' } }, context: null });
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it('maps RPC failures to a safe response', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('OWNER'));
    const client = makeClient({ rpcError: { message: 'database failure' } });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Could not load your team' });
  });
});