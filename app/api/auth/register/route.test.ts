import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an immediately confirmed user without invoking email delivery', async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
      error: null,
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { createUser } },
    });

    const response = await POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'new@example.com',
          password: 'strong-password',
          organizationName: 'Aurora Lab',
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(createUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'strong-password',
      email_confirm: true,
      user_metadata: { organizationName: 'Aurora Lab' },
    });
  });

  it('returns conflict for an existing email', async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { createUser } },
    });

    const response = await POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'strong-password',
          organizationName: 'Aurora Lab',
        }),
      }),
    );

    expect(response.status).toBe(409);
  });

  it('validates required registration fields', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'bad',
          password: 'short',
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
