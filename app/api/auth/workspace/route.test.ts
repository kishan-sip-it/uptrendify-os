import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from './route';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireOrgRole: mocks.requireOrgRole,
  ROLES: { OWNER: 'OWNER' },
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

describe('DELETE /api/auth/workspace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires exact workspace deletion confirmation', async () => {
    const response = await DELETE(new NextRequest('http://localhost/api/auth/workspace', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: 'DELETE' }),
    }));
    expect(response.status).toBe(400);
  });

  it('requires workspace-owner role', async () => {
    mocks.requireOrgRole.mockResolvedValue({
      error: { status: 403, body: { error: 'Forbidden' } },
      context: null,
    });

    const response = await DELETE(new NextRequest('http://localhost/api/auth/workspace', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: 'DELETE WORKSPACE' }),
    }));
    expect(response.status).toBe(403);
  });

  it('deletes only the selected organization through the admin client', async () => {
    mocks.requireOrgRole.mockResolvedValue({
      error: null,
      context: { organizationId: ORG_ID, role: 'OWNER', userId: USER_ID },
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      from: (table: string) => {
        if (table !== 'organizations') throw new Error('unexpected table');
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: ORG_ID, name: 'Aurora Lab' }, error: null }),
            }),
          }),
        };
      },
    });
    const deleteOrg = vi.fn(() => ({ eq: async () => ({ error: null }) }));
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table !== 'organization_members') throw new Error('unexpected table');
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ user_id: USER_ID, role: 'OWNER' }], error: null }),
          }),
        };
      },
      auth: { admin: {} },
      deleteOrg,
    });

    const admin = mocks.createSupabaseAdminClient.mock.results[0]?.value;
    if (admin) {
      admin.from = (table: string) => {
        if (table === 'organization_members') {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [{ user_id: USER_ID, role: 'OWNER' }], error: null }),
            }),
          };
        }
        if (table === 'organizations') {
          return { delete: () => ({ eq: async () => ({ error: null }) }) };
        }
        throw new Error('unexpected table: ' + table);
      };
    }

    const response = await DELETE(new NextRequest('http://localhost/api/auth/workspace', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: 'DELETE WORKSPACE' }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });
});
