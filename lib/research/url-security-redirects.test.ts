import dns from 'node:dns/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicHttpFollowingRedirects } from './url-security';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockPublicDns(): void {
  vi.spyOn(dns, 'lookup').mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
  ] as never);
}

describe('fetchPublicHttpFollowingRedirects', () => {
  it('follows a public cross-host CDN redirect and returns the final asset URL', async () => {
    mockPublicDns();
    const request = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://cdn.example.test/assets/brand-mark.svg' },
      }))
      .mockResolvedValueOnce(new Response('<svg></svg>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      }));

    const result = await fetchPublicHttpFollowingRedirects(
      'https://www.example.test/logo.svg',
      { headers: { accept: 'image/svg+xml' } },
    );

    expect(result.response.status).toBe(200);
    expect(result.url).toBe('https://cdn.example.test/assets/brand-mark.svg');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
    expect(request.mock.calls[1]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('rejects a redirect to a private or loopback address before making the second request', async () => {
    mockPublicDns();
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/internal' },
    }));

    await expect(fetchPublicHttpFollowingRedirects('https://public-redirect.example.test/logo.svg'))
      .rejects.toThrow(/Private|loopback/i);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects a public redirect to a non-standard port', async () => {
    mockPublicDns();
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: 'https://cdn.example.test:8443/logo.svg' },
    }));

    await expect(fetchPublicHttpFollowingRedirects('https://public-port-redirect.example.test/logo.svg'))
      .rejects.toThrow('Non-standard ports');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('stops redirect loops without making a duplicate request', async () => {
    mockPublicDns();
    const request = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://loop-redirect.example.test/logo.svg?second=1' },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://loop-redirect.example.test/logo.svg' },
      }));

    await expect(fetchPublicHttpFollowingRedirects('https://loop-redirect.example.test/logo.svg'))
      .rejects.toThrow('redirect loop');
    expect(request).toHaveBeenCalledTimes(2);
  });
});
