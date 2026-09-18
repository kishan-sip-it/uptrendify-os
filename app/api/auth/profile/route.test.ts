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

function makeClient(options: {
  profile?: {
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    team_size: string | null;
    timezone: string | null;
    onboarding_completed: boolean;
    organization_id: string | null;
  } | null;
} = { profile: null }) {
  const upsertedRows: any[] = [];
  const client: any = {
    from: (table: string) => {
      const calls: any[] = [];
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === 'organization_members') {
            return { data: { organization_id: ORG_ID, role: 'OWNER' }, error: null };
          }
          return { data: options.profile ?? null, error: null };
        },
        upsert: async (row: any) => {
          upsertedRows.push(row);
          return { data: null, error: null };
        },
      };
      return chain;
    },
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    upsertedRows,
  };
  return client;
}

describe('POST /api/auth/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not allow a user to self-promote membership role', async () => {
    const client = makeClient();
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
    expect(client.upsertedRows[0].role).toBe('OWNER');
  });

  it('preserves omitted fields when finishing onboarding', async () => {
    const client = makeClient({
      profile: {
        first_name: 'Kishan',
        last_name: 'Patel',
        role: 'OWNER',
        team_size: '2-5',
        timezone: 'Asia/Kolkata',
        onboarding_completed: false,
        organization_id: ORG_ID,
      },
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(
      new NextRequest('http://localhost/api/auth/profile', {
        method: 'POST',
        body: JSON.stringify({ onboardingComplete: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(client.upsertedRows[0]).toMatchObject({
      organization_id: ORG_ID,
      first_name: 'Kishan',
      last_name: 'Patel',
      role: 'OWNER',
      team_size: '2-5',
      timezone: 'Asia/Kolkata',
      onboarding_completed: true,
    });
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
