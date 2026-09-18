import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const USER_ID = '00000000-0000-4000-8000-000000000002';
const ORG_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

function makeClient() {
  const calls: string[] = [];
  const client: any = {
    from: (table: string) => {
      calls.push(table);
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({
          data: table === 'organization_members'
            ? { organization_id: ORG_ID, role: 'OWNER' }
            : null,
          error: null,
        }),
        upsert: async () => ({ data: null, error: null }),
      };
      return chain;
    },
    calls,
  };
  return client;
}

describe('POST /api/auth/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not allow a user to self-promote membership role', async () => {
    const client = makeClient();
    client.auth = { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) };
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(
      new NextRequest('http://localhost/api/auth/profile', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Kishan',
          role: 'OWNER',
          onboardingComplete: false,
        }),
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile.role).toBe('OWNER');
    expect(client.calls.filter((table: string) => table === 'organization_members')).toHaveLength(1);
  });

  it('requires authentication', async () => {
    const client = makeClient();
    client.auth = { getUser: async () => ({ data: { user: null }, error: null }) };
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(
      new NextRequest('http://localhost/api/auth/profile', {
        method: 'POST',
        body: JSON.stringify({ firstName: 'Kishan', role: 'OWNER' }),
      }),
    );

    expect(response.status).toBe(401);
  });
});
