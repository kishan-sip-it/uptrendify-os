import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, PATCH } from './route';

const USER_ID = '00000000-0000-4000-8000-000000000002';
const TARGET_ID = '00000000-0000-4000-8000-000000000003';
const ORG_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireOrgRole: mocks.requireOrgRole,
  CAN_REMOVE_MEMBER: ['OWNER', 'ADMIN'],
  CAN_UPDATE_MEMBER_ROLE: ['OWNER', 'ADMIN'],
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

function makeClient(options: { rpcError?: { message: string } | null }) {
  const client: any = {
    rpc: vi.fn(async () => ({ data: null, error: options.rpcError ?? null })),
  };
  return client;
}

function authContext(role: string) {
  return { error: null, context: { organizationId: ORG_ID, role, userId: USER_ID } };
}

describe('PATCH /api/team/members/[userId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the member role through the RPC with the caller organization', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('OWNER'));
    const client = makeClient({});
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await PATCH(
      new NextRequest('http://localhost/api/team/members/target', { method: 'PATCH', body: JSON.stringify({ role: 'ADMIN' }) }),
      { params: Promise.resolve({ userId: TARGET_ID }) },
    );

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith('update_organization_member_role', {
      p_organization_id: ORG_ID,
      p_target_user_id: TARGET_ID,
      p_new_role: 'ADMIN',
    });
  });

  it('maps CANNOT_MODIFY_OWNER to a 403 for non-owner actors', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('ADMIN'));
    const client = makeClient({ rpcError: { message: 'CANNOT_MODIFY_OWNER' } });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await PATCH(
      new NextRequest('http://localhost/api/team/members/target', { method: 'PATCH', body: JSON.stringify({ role: 'EDITOR' }) }),
      { params: Promise.resolve({ userId: TARGET_ID }) },
    );

    expect(response.status).toBe(403);
  });

  it('maps LAST_OWNER_PROTECTED to a 409', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('OWNER'));
    const client = makeClient({ rpcError: { message: 'LAST_OWNER_PROTECTED' } });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await PATCH(
      new NextRequest('http://localhost/api/team/members/target', { method: 'PATCH', body: JSON.stringify({ role: 'EDITOR' }) }),
      { params: Promise.resolve({ userId: TARGET_ID }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('at least one owner') });
  });
});

describe('DELETE /api/team/members/[userId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes the member through the RPC', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('OWNER'));
    const client = makeClient({});
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await DELETE(
      new NextRequest('http://localhost/api/team/members/target', { method: 'DELETE' }),
      { params: Promise.resolve({ userId: TARGET_ID }) },
    );

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith('remove_organization_member', {
      p_organization_id: ORG_ID,
      p_target_user_id: TARGET_ID,
    });
  });

  it('maps CANNOT_REMOVE_SELF to a 400', async () => {
    mocks.requireOrgRole.mockResolvedValue(authContext('OWNER'));
    const client = makeClient({ rpcError: { message: 'CANNOT_REMOVE_SELF' } });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await DELETE(
      new NextRequest('http://localhost/api/team/members/self', { method: 'DELETE' }),
      { params: Promise.resolve({ userId: USER_ID }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('cannot remove yourself') });
  });

  it('rejects unauthorized actors before reaching the RPC', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { status: 403, body: { error: 'Forbidden' } }, context: null });

    const response = await DELETE(
      new NextRequest('http://localhost/api/team/members/target', { method: 'DELETE' }),
      { params: Promise.resolve({ userId: TARGET_ID }) },
    );

    expect(response.status).toBe(403);
  });
});