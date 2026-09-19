import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from './route';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
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

  it('blocks deletion when the user is the sole workspace owner', async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    });
    let membershipQuery = 0;
    const from = vi.fn((table: string) => {
      if (table !== 'organization_members') throw new Error(`Unexpected table: ${table}`);
      membershipQuery += 1;
      if (membershipQuery === 1) {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ organization_id: 'org-1', role: 'OWNER' }], error: null }),
          }),
        };
      }
      return {
        select: () => ({
          in: () => ({
            eq: () => Promise.resolve({
              data: [{ organization_id: 'org-1', user_id: USER_ID, role: 'OWNER' }],
              error: null,
            }),
          }),
        }),
      };
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from });
    const response = await DELETE(request({ confirmation: 'DELETE' }));
    expect(response.status).toBe(409);
  });

  it('removes the account and detaches historical user references', async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    });

    const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    const remove = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    const deleteUser = vi.fn().mockResolvedValue({ data: null, error: null });
    const rows: Record<string, any> = {
      organization_members: [{ organization_id: 'org-1', role: 'ADMIN' }],
    };
    const from = vi.fn((table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows[table] ?? [], error: null }),
        in: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      update,
      delete: remove,
    }));
    mocks.createSupabaseAdminClient.mockReturnValue({
      from,
      auth: { admin: { deleteUser } },
    });

    const response = await DELETE(request({ confirmation: 'DELETE' }));

    expect(response.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(update).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('requires an authenticated session', async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    });

    const response = await DELETE(request({ confirmation: 'DELETE' }));
    expect(response.status).toBe(401);
  });
});
