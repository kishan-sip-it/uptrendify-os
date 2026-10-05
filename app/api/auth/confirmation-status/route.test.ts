import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const USER_ID = '00000000-0000-4000-8000-000000000002';
const NONCE = '0123456789abcdef0123456789abcdef';

const mocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        getUserById: mocks.getUserById,
      },
    },
  }),
}));

describe('POST /api/auth/confirmation-status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports confirmed only for the matching fresh signup nonce', async () => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          email_confirmed_at: new Date().toISOString(),
          user_metadata: {
            signupNonce: NONCE,
            signupIntentCreatedAt: Date.now(),
          },
        },
      },
      error: null,
    });

    const response = await POST(
      new Request('https://example.com/api/auth/confirmation-status', {
        method: 'POST',
        body: JSON.stringify({ userId: USER_ID, nonce: NONCE }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ confirmed: true });
  });

  it('does not reveal confirmation state for a mismatched nonce', async () => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          email_confirmed_at: new Date().toISOString(),
          user_metadata: {
            signupNonce: NONCE,
            signupIntentCreatedAt: Date.now(),
          },
        },
      },
      error: null,
    });

    const response = await POST(
      new Request('https://example.com/api/auth/confirmation-status', {
        method: 'POST',
        body: JSON.stringify({ userId: USER_ID, nonce: 'fedcba9876543210fedcba9876543210' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ confirmed: false });
  });

  it('treats expired signup intents as unconfirmed', async () => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          email_confirmed_at: new Date().toISOString(),
          user_metadata: {
            signupNonce: NONCE,
            signupIntentCreatedAt: Date.now() - 31 * 60 * 1000,
          },
        },
      },
      error: null,
    });

    const response = await POST(
      new Request('https://example.com/api/auth/confirmation-status', {
        method: 'POST',
        body: JSON.stringify({ userId: USER_ID, nonce: NONCE }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ confirmed: false });
  });

  it('returns an actionable temporary-unavailable response when the status provider fails', async () => {
    mocks.getUserById.mockRejectedValue(new Error('Supabase admin environment is not configured'));

    const response = await POST(
      new Request('https://example.com/api/auth/confirmation-status', {
        method: 'POST',
        body: JSON.stringify({ userId: USER_ID, nonce: NONCE }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Confirmation check is temporarily unavailable. Please try again in a moment.',
    });
  });
});
