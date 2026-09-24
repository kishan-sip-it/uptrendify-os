import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: () => ({
    RESEARCH_USER_AGENT: 'TestBot/1.0',
    MAX_RESEARCH_PAGES: 2,
    MAX_RESEARCH_BYTES: 5_000_000,
    MAX_RESEARCH_REDIRECTS: 2,
    RESEARCH_TIMEOUT_MS: 5_000,
    RESEARCH_TOTAL_BUDGET_MS: 20_000,
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  }),
}));

vi.mock('@/lib/obs/logger', () => ({
  obs: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { crawlBrand } from './crawler';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const BRAND_ID = '00000000-0000-0000-0000-000000000002';
const RUN_ID = '00000000-0000-0000-0000-000000000003';
const SOURCE_ID = '00000000-0000-0000-0000-000000000004';

function htmlPage(title: string, links = '<a href="/about">About</a>') {
  return `<!DOCTYPE html><html><head><title>${title}</title><meta name="description" content="desc"/></head><body><h1>Hello</h1><p>Brand content here.</p>${links}</body></html>`;
}

function mockSupabase() {
  const updates: string[] = [];
  const updatesPayload: Array<Record<string, unknown>> = [];
  const sourceUpserts: Array<Record<string, unknown>> = [];
  const researchSourceUpserts: Array<Record<string, unknown>> = [];
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'research_runs') {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            updates.push(String(payload.status));
            updatesPayload.push(payload);
            return { eq: vi.fn(async () => ({ data: payload, error: null })) };
          }),
        };
      }
      if (table === 'brand_sources') {
        return {
          upsert: vi.fn((payload: Record<string, unknown>) => {
            sourceUpserts.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: SOURCE_ID }, error: null })),
              })),
            };
          }),
        };
      }
      if (table === 'research_sources') {
        return {
          upsert: vi.fn((payload: Record<string, unknown>) => {
            researchSourceUpserts.push(payload);
            return { error: null };
          }),
        };
      }
      return {};
    }),
    __updates: updates,
    __updatesPayload: updatesPayload,
    __sourceUpserts: sourceUpserts,
    __researchSourceUpserts: researchSourceUpserts,
  };
  return client;
}

describe('crawlBrand', () => {
  it('crawls pages and completes with COMPLETED status', async () => {
    const fetchMock = vi.fn(async (url: string, opts: RequestInit) =>
      new Response(htmlPage('Landing'), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = mockSupabase() as any;
    const result = await crawlBrand(client, { organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'http://8.8.8.8', researchRunId: RUN_ID });

    expect(result.status).toBe('COMPLETED');
    expect(result.pagesProcessed).toBeGreaterThanOrEqual(1);
    expect(result.pagesDiscovered).toBeGreaterThanOrEqual(1);
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual', dispatcher: expect.anything() });
    expect(client.__updates).toContain('RUNNING');
    expect(client.__updates).toContain('COMPLETED');
    expect(result.processedPages[0].title).toBe('Landing');
    expect(result.processedPages[0].id).toBe(SOURCE_ID);
  });

  it('uses the rendered fallback for a JavaScript app shell with little extractable text', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      callCount += 1;
      if (callCount === 1) {
        const shell = '<!DOCTYPE html><html><head><title>Shell</title></head><body><div id="root"></div><script>window.__next_f.push([])</script><script>' + 'x'.repeat(700) + '</script></body></html>';
        return new Response(shell, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return new Response('# Aurora\n\n' + 'This is rendered content from the client application with enough detail to be useful for research and brand understanding. '.repeat(8), {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }));

    const client = mockSupabase() as any;
    const result = await crawlBrand(client, {
      organizationId: ORG_ID,
      brandId: BRAND_ID,
      websiteUrl: 'http://8.8.8.8',
      researchRunId: RUN_ID,
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.processedPages[0].title).toBe('Aurora');
    expect(result.processedPages[0].text).toContain('rendered content from the client application');
  });

  it('returns FAILED when no pages can be processed (all 404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } })
    ));

    const client = mockSupabase() as any;
    const result = await crawlBrand(client, { organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'http://8.8.8.8', researchRunId: RUN_ID });
    expect(result.status).toBe('FAILED');
    expect(result.pagesProcessed).toBe(0);
    expect(result.processedPages).toEqual([]);
  });

  it('returns PARTIAL when some pages are non-HTML', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      callCount++;
      if (callCount === 1) {
        return new Response(htmlPage('Good page'), {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      return new Response('binary', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      });
    }));

    const client = mockSupabase() as any;
    const result = await crawlBrand(client, { organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'http://8.8.8.8', researchRunId: RUN_ID });
    expect(result.status).toBe('PARTIAL');
    expect(result.pagesProcessed).toBeGreaterThanOrEqual(1);
  });

  it('respects the configured page limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(htmlPage('Page', ''), { status: 200, headers: { 'content-type': 'text/html' } })
    ));

    const client = mockSupabase() as any;
    const result = await crawlBrand(client, { organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'http://8.8.8.8', researchRunId: RUN_ID });
    expect(result.pagesProcessed).toBeLessThanOrEqual(2);
  });

  it('records a failed run when URL preflight rejects before crawling', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const client = mockSupabase() as any;
    await expect(
      crawlBrand(client, {
        organizationId: ORG_ID,
        brandId: BRAND_ID,
        websiteUrl: 'ftp://example.com',
        researchRunId: RUN_ID,
      }),
    ).rejects.toThrow();

    expect(client.__updates).toContain('RUNNING');
    expect(client.__updates).toContain('FAILED');
    const failedPayload = client.__updatesPayload.find((payload: any) => payload.status === 'FAILED');
    expect(failedPayload?.error_code).toBe('RESEARCH_FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects private target before fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const client = mockSupabase() as any;
    await expect(crawlBrand(client, { organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'http://127.0.0.1', researchRunId: RUN_ID })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not follow cross-origin redirects', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://8.8.8.8/') {
        return new Response(null, { status: 301, headers: { location: 'https://evil.example.com/' } });
      }
      return new Response(htmlPage('Evil'), { status: 200, headers: { 'content-type': 'text/html' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = mockSupabase() as any;
    const result = await crawlBrand(client, { organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'http://8.8.8.8', researchRunId: RUN_ID });
    expect(result.status).toBe('FAILED');
    expect(fetchMock.mock.calls.map((c) => c[0])).not.toContain('https://evil.example.com/');
  });

  it('persists the real transport error code in the FAILED run and sources', async () => {
    vi.stubGlobal('fetch', vi.fn(() => {
      const error = Object.assign(new Error('connect ECONNREFUSED 8.8.8.8'), { code: 'ECONNREFUSED' });
      return Promise.reject(error);
    }));

    const client = mockSupabase() as any;
    const result = await crawlBrand(client, { organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'http://8.8.8.8', researchRunId: RUN_ID });
    expect(result.status).toBe('FAILED');

    const failedUpdate = client.__updatesPayload.find((payload: any) => payload.status === 'FAILED');
    expect(failedUpdate?.error_code).toBe('CONNECTION_REFUSED');
    expect(failedUpdate?.error_message).toContain('ECONNREFUSED');

    const source = client.__sourceUpserts[0];
    expect(source?.status).toBe('FAILED');
    expect(source?.http_status).toBe(0);
    expect(source?.metadata).toMatchObject({ error_code: 'CONNECTION_REFUSED', error: expect.stringContaining('ECONNREFUSED') });

    const researchSource = client.__researchSourceUpserts[0];
    expect(researchSource?.status).toBe('FAILED');
    expect(researchSource?.error_message).toContain('[CONNECTION_REFUSED]');
  });

  it('persists the real HTTP status for non-2xx responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('nope', { status: 503, headers: { 'content-type': 'text/html' } })
    ));

    const client = mockSupabase() as any;
    const result = await crawlBrand(client, { organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'http://8.8.8.8', researchRunId: RUN_ID });
    expect(result.status).toBe('FAILED');

    const source = client.__sourceUpserts[0];
    expect(source?.http_status).toBe(503);
    expect(source?.metadata).toMatchObject({ error_code: 'HTTP_503' });

    const failedUpdate = client.__updatesPayload.find((payload: any) => payload.status === 'FAILED');
    expect(failedUpdate?.error_code).toBe('HTTP_503');
  });
});