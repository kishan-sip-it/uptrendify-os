import { describe, expect, it, vi, afterEach } from 'vitest';
import { discoverBrandWebsites } from './brand-discovery';

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
});

describe('discoverBrandWebsites', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns no candidates for an empty query without making a network request', async () => {
    await expect(discoverBrandWebsites('   ')).resolves.toEqual([]);
  });

  it('prefers an exact .com domain match over a weaker .io match', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('google.com/search')) return htmlResponse('<a href="/url?q=https://auroralabs.io"><h3>Aurora Labs</h3></a>');
      if (url.includes('bing.com/search')) return htmlResponse('<li class="b_algo"><h2><a href="https://auroralabs.io">Aurora Labs</a></h2></li>');
      if (url.includes('duckduckgo.com/html')) return htmlResponse('<a class="result__a" href="https://auroralabs.io">Aurora Labs</a>');
      if (url === 'https://auroralabs.com') return htmlResponse('<html><head><title>Aurora Labs</title></head><body>official</body></html>');
      if (url === 'https://auroralabs.io') return htmlResponse('<html><head><title>Aurora Labs</title></head><body>other</body></html>');
      return htmlResponse('', 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    const candidates = await discoverBrandWebsites('Aurora Labs');
    expect(candidates[0]?.url).toBe('https://auroralabs.com');
    expect(candidates.find((candidate) => candidate.url === 'https://auroralabs.io')).toBeDefined();
  });

  it('keeps a reachable exact-domain candidate when HTML access is blocked', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://auroralabs.com') return new Response('', { status: 403 });
      return htmlResponse('', 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    const candidates = await discoverBrandWebsites('Aurora Labs');
    expect(candidates.some((candidate) => candidate.url === 'https://auroralabs.com')).toBe(true);
  });
}
