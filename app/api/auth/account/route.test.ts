import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from './route';

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

function request(body: unknown) {
  return new NextRequest('http://localhost/api/auth/account', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('DELETE /api/auth/account', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires the DELETE confirmation word', async () => {
    const response = await DELETE(request({ confirmation: 'remove' }));
    expect(response.status).toBe(400);
  });

  it('requires all workspaces to be deleted first', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'WORKSPACES_MUST_BE_DELETED_FIRST' },
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc });

    const response = await DELETE(request({ confirmation: 'DELETE' }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      requiresWorkspaceDeletion: true,
    });
  });

  it('deletes the authenticated account through the secure RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true },
      error: null,
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc });

    const response = await DELETE(request({ confirmation: 'DELETE' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith('delete_current_account');
  });

  it('maps authentication failure', async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'AUTHENTICATION_REQUIRED' },
      }),
    });

    const response = await DELETE(request({ confirmation: 'DELETE' }));

    expect(response.status).toBe(401);
  });
});
