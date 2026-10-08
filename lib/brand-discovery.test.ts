import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearBrandDiscoveryCache, discoverBrandWebsites } from './brand-discovery';

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
}

describe('discoverBrandWebsites', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearBrandDiscoveryCache();
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

  it('prefers the closest brand-domain variant on .com over a plural lookalike .io result', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('google.com/search')) return htmlResponse('<a href="/url?q=https://auroralabs.io"><h3>Aurora Labs</h3></a>');
      if (url.includes('bing.com/search')) return htmlResponse('<li class="b_algo"><h2><a href="https://auroralabs.io">Aurora Labs</a></h2></li>');
      if (url.includes('duckduckgo.com/html')) return htmlResponse('<a class="result__a" href="https://auroralabs.io">Aurora Labs</a>');
      if (url === 'https://auroralab.com') return htmlResponse('<html><head><title>Aurora Labs</title></head><body>official</body></html>');
      if (url === 'https://auroralabs.io') return htmlResponse('<html><head><title>Aurora Labs</title></head><body>other</body></html>');
      return htmlResponse('', 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    const candidates = await discoverBrandWebsites('Aurora Lab');
    expect(candidates[0]?.url).toBe('https://auroralab.com');
  });

  it('allows an exact social-domain brand such as Instagram while keeping unrelated social results blocked', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('google.com/search')) {
        return htmlResponse('<a href="/url?q=https://instagram.com"><h3>Instagram</h3></a>');
      }
      if (url.includes('bing.com/search')) {
        return htmlResponse('<li class="b_algo"><h2><a href="https://instagram.com">Instagram</a></h2></li>');
      }
      if (url.includes('duckduckgo.com/html')) {
        return htmlResponse('<a class="result__a" href="https://instagram.com">Instagram</a>');
      }
      if (url === 'https://instagram.com') return new Response('', { status: 403 });
      return htmlResponse('', 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const candidates = await discoverBrandWebsites('Instagram');
    expect(candidates.some((candidate) => candidate.url === 'https://instagram.com')).toBe(true);
  });

  it('finds exact official social domains such as Facebook', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('google.com/search')) return htmlResponse('<a href="/url?q=https://facebook.com"><h3>Facebook</h3></a>');
      if (url.includes('bing.com/search')) return htmlResponse('<li class="b_algo"><h2><a href="https://facebook.com">Facebook</a></h2></li>');
      if (url.includes('duckduckgo.com/html')) return htmlResponse('<a class="result__a" href="https://html.duckduckgo.com/l/?uddg=https%3A%2F%2Ffacebook.com">Facebook</a>');
      if (url === 'https://facebook.com') return htmlResponse('<html><head><title>Facebook</title></head><body>Connect with friends</body></html>');
      return htmlResponse('', 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const candidates = await discoverBrandWebsites('Facebook');
    expect(candidates[0]?.url).toBe('https://facebook.com');
  });

  it('unwraps search-engine redirect URLs before ranking the real website', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('duckduckgo.com/html')) {
        return htmlResponse('<a class="result__a" href="https://html.duckduckgo.com/l/?uddg=https%3A%2F%2Fauroralabs.com">Aurora Labs</a>');
      }
      if (url.includes('google.com/search')) return htmlResponse('');
      if (url.includes('bing.com/search')) return htmlResponse('');
      if (url === 'https://auroralabs.com') return htmlResponse('<html><head><title>Aurora Labs</title></head><body>official</body></html>');
      return htmlResponse('', 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const candidates = await discoverBrandWebsites('Aurora Labs');
    expect(candidates.some((candidate) => candidate.url === 'https://auroralabs.com')).toBe(true);
  });

  it('does not surface an obviously parked exact domain over a real search result', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('google.com/search')) return htmlResponse('<a href="/url?q=https://auroralabs.io"><h3>Aurora Labs</h3></a>');
      if (url.includes('bing.com/search')) return htmlResponse('<li class="b_algo"><h2><a href="https://auroralabs.io">Aurora Labs</a></h2></li>');
      if (url.includes('duckduckgo.com/html')) return htmlResponse('<a class="result__a" href="https://auroralabs.io">Aurora Labs</a>');
      if (url === 'https://auroralabs.com') return htmlResponse('<html><head><title>Aurora Labs domain for sale</title></head><body>This domain is for sale.</body></html>');
      if (url === 'https://auroralabs.io') return htmlResponse('<html><head><title>Aurora Labs</title></head><body>Official site</body></html>');
      return htmlResponse('', 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const candidates = await discoverBrandWebsites('Aurora Labs');
    expect(candidates[0]?.url).toBe('https://auroralabs.io');
    expect(candidates.some((candidate) => candidate.url === 'https://auroralabs.com')).toBe(false);
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

  it('recognizes a direct public website query without relying on search-engine results', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://8.8.8.8')) {
        return htmlResponse('<html><head><title>Direct Website</title></head><body>Official site</body></html>');
      }
      return htmlResponse('', 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const candidates = await discoverBrandWebsites('8.8.8.8');
    expect(candidates[0]?.url).toBe('https://8.8.8.8');
    expect(candidates[0]?.title).toBe('Direct Website');
  });
});
