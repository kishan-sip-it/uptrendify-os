import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from './route';

const ORG_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireOrgRole: mocks.requireOrgRole,
  ROLES: { OWNER: 'OWNER' },
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
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

  it('deletes the selected workspace through the authenticated RPC', async () => {
    mocks.requireOrgRole.mockResolvedValue({
      error: null,
      context: { organizationId: ORG_ID, role: 'OWNER', userId: 'user-1' },
    });
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, organization_name: 'Aurora Lab' },
      error: null,
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc });

    const response = await DELETE(new NextRequest('http://localhost/api/auth/workspace', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: 'DELETE WORKSPACE' }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith('delete_current_workspace', {
      target_organization_id: ORG_ID,
    });
  });

  it('maps workspace RPC authorization errors', async () => {
    mocks.requireOrgRole.mockResolvedValue({
      error: null,
      context: { organizationId: ORG_ID, role: 'OWNER', userId: 'user-1' },
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'WORKSPACE_OWNER_REQUIRED' },
      }),
    });

    const response = await DELETE(new NextRequest('http://localhost/api/auth/workspace', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: 'DELETE WORKSPACE' }),
    }));

    expect(response.status).toBe(403);
  });
});
