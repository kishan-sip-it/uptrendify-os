import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const USER_ID = '00000000-0000-4000-8000-000000000002';
const ORG_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

function makeClient(options: {
  verifyError?: { message: string } | null;
  user?: { id: string; email?: string } | null;
  userError?: { message: string } | null;
  membership?: { organization_id: string } | null;
  profile?: { onboarding_completed: boolean } | null;
}) {
  return {
    auth: {
      verifyOtp: vi.fn(async () => ({ error: options.verifyError ?? null })),
      getUser: vi.fn(async () => ({
        data: { user: options.user ?? null },
        error: options.userError ?? null,
      })),
    },
    from: (table: string) => {
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.maybeSingle = async () => {
        if (table === 'organization_members') {
          return { data: options.membership ?? null, error: null };
        }
        return { data: options.profile ?? null, error: null };
      };
      return chain;
    },
  };
}

describe('GET /auth/confirm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects malformed confirmation links', async () => {
    const response = await GET(new NextRequest('https://example.com/auth/confirm'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login?confirmation=failed');
  });

  it('verifies the token and routes a new account to onboarding', async () => {
    const client = makeClient({
      user: { id: USER_ID, email: 'user@example.com' },
      membership: null,
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await GET(
      new NextRequest('https://example.com/auth/confirm?token_hash=abc&type=email'),
    );

    expect(client.auth.verifyOtp).toHaveBeenCalledWith({
      type: 'email',
      token_hash: 'abc',
    });
    expect(response.headers.get('location')).toContain('/onboarding?confirmed=1');
  });

  it('routes an existing confirmed account to dashboard when onboarding is complete', async () => {
    const client = makeClient({
      user: { id: USER_ID, email: 'user@example.com' },
      membership: { organization_id: ORG_ID },
      profile: { onboarding_completed: true },
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await GET(
      new NextRequest('https://example.com/auth/confirm?token_hash=abc&type=email'),
    );

    expect(response.headers.get('location')).toContain('/dashboard?confirmed=1');
  });

  it('rejects expired or invalid tokens', async () => {
    const client = makeClient({
      verifyError: { message: 'Token has expired or is invalid' },
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await GET(
      new NextRequest('https://example.com/auth/confirm?token_hash=expired&type=email'),
    );

    expect(response.headers.get('location')).toContain('/login?confirmation=failed');
  });
});
