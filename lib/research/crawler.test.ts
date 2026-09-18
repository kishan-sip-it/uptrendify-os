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
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'research_runs') {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            updates.push(String(payload.status));
            return { eq: vi.fn(async () => ({ data: payload, error: null })) };
          }),
        };
      }
      if (table === 'brand_sources') {
        return {
          upsert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: SOURCE_ID }, error: null })),
            })),
          })),
        };
      }
      if (table === 'research_sources') {
        return { upsert: vi.fn(async () => ({ error: null })) };
      }
      return {};
    }),
    __updates: updates,
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
});