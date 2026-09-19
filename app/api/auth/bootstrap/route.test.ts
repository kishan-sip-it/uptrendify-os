import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const USER_ID = '00000000-0000-4000-8000-000000000002';
const ORG_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

function makeClient(options: {
  user?: { id: string; user_metadata?: { organizationName?: string } } | null;
  membership?: { organization_id: string; role: string } | null;
  rpcResult?: unknown;
  rpcError?: { message: string } | null;
}) {
  const client: any = {
    auth: {
      getUser: async () => ({ data: { user: options.user ?? null }, error: null }),
    },
    from: (table: string) => {
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.maybeSingle = async () => {
        if (table === 'organization_members') return { data: options.membership ?? null, error: null };
        return { data: options.membership ? { id: ORG_ID, name: 'Aurora Labs' } : null, error: null };
      };
      return chain;
    },
    rpc: vi.fn(async () => ({ data: options.rpcResult ?? null, error: options.rpcError ?? null })),
  };
  return client;
}

describe('POST /api/auth/bootstrap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the authenticated bootstrap RPC instead of requiring a service-role key', async () => {
    const client = makeClient({
      user: { id: USER_ID },
      rpcResult: [{ id: ORG_ID, role: 'OWNER', name: 'Aurora Labs' }],
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(
      new NextRequest('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ organizationName: 'Aurora Labs' }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.organization).toEqual({ id: ORG_ID, role: 'OWNER', name: 'Aurora Labs' });
    expect(client.rpc).toHaveBeenCalledWith('bootstrap_organization', { organization_name: 'Aurora Labs' });
  });

  it('returns the existing organization from POST without requiring the organization name again', async () => {
    const client = makeClient({
      user: { id: USER_ID },
      membership: { organization_id: ORG_ID, role: 'OWNER' },
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(
      new NextRequest('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      organization: { id: ORG_ID, role: 'OWNER', name: 'Aurora Labs' },
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('uses signup metadata when the browser does not send an organization name', async () => {
    const client = makeClient({
      user: { id: USER_ID, user_metadata: { organizationName: 'Metadata Agency' } },
      rpcResult: { id: ORG_ID, role: 'OWNER', name: 'Metadata Agency' },
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(
      new NextRequest('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(201);
    expect(client.rpc).toHaveBeenCalledWith('bootstrap_organization', { organization_name: 'Metadata Agency' });
  });

  it('returns a setup error instead of asking for the organization again when metadata is missing', async () => {
    const client = makeClient({ user: { id: USER_ID } });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(
      new NextRequest('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('workspace setup is incomplete') });
  });

  it('returns 401 when there is no authenticated user', async () => {
    const client = makeClient({ user: null });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(
      new NextRequest('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ organizationName: 'Aurora Labs' }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it('maps RPC failures to a safe response', async () => {
    const client = makeClient({
      user: { id: USER_ID },
      rpcError: { message: 'database failure' },
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await POST(
      new NextRequest('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ organizationName: 'Aurora Labs' }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Could not create your workspace' });
  });

  it('returns an existing organization without needing bootstrap RPC', async () => {
    const client = makeClient({
      user: { id: USER_ID },
      membership: { organization_id: ORG_ID, role: 'OWNER' },
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ organization: { id: ORG_ID, role: 'OWNER', name: 'Aurora Labs' } });
  });
});
