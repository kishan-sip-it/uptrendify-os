import { describe, it, expect, vi, beforeEach } from 'vitest';
import { after } from 'next/server';
import { runResearchPipeline, scheduleResearchExecution, persistSourceChunks, MAX_CHUNKS_PER_SOURCE } from './pipeline';

const afterHarness = vi.hoisted(() => ({ callbacks: [] as Array<() => unknown> }));
vi.mock('next/server', () => ({
  after: vi.fn((fn: () => unknown) => {
    afterHarness.callbacks.push(fn);
  }),
}));

const mocks = vi.hoisted(() => ({
  crawlBrand: vi.fn(),
  analyzeResearchEvidence: vi.fn(),
}));

vi.mock('./crawler', () => ({ crawlBrand: mocks.crawlBrand }));
vi.mock('./brain', () => ({ analyzeResearchEvidence: mocks.analyzeResearchEvidence }));

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const BRAND_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000003';
const SOURCE_ID = '00000000-0000-4000-8000-000000000004';

function makeSupabaseMock() {
  const chains = new Map<string, () => unknown>();
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const from = vi.fn((table: string) => {
    const execute = chains.get(String(table)) ?? (() => ({ data: null, error: null }));
    const thenable: PromiseLike<unknown> = { then: (onFul) => Promise.resolve(execute()).then(onFul) };
    const proxy = new Proxy(thenable, {
      get(target, prop) {
        if (prop in target || prop === 'then') return Reflect.get(target, prop);
        const name = String(prop);
        if (name === 'maybeSingle') return async () => execute();
        if (name === 'single') return async () => {
          const value = (await execute()) as any;
          return { data: Array.isArray(value?.data) ? value.data[0] : value?.data ?? null, error: value?.error ?? null };
        };
        return (...args: unknown[]) => {
          calls.push({ table: String(table), method: name, args });
          return proxy;
        };
      },
    });
    return proxy;
  });
  return {
    from,
    calls,
    on(table: string, resolver: () => unknown) {
      chains.set(String(table), resolver);
    },
  };
}

describe('persistSourceChunks', () => {
  it('chunks page text into brand_source_chunks rows', async () => {
    const client = makeSupabaseMock();
    client.on('brand_source_chunks', () => ({ data: null, error: null }));

    const page = { id: SOURCE_ID, url: 'https://example.com/', text: 'Aurora builds analytics software for operations teams. '.repeat(80) };
    const count = await persistSourceChunks(client as any, { organizationId: ORG_ID, brandId: BRAND_ID, researchRunId: RUN_ID, pages: [page as any] });

    expect(count).toBeGreaterThan(1);
    const upsert = client.calls.find((call) => call.table === 'brand_source_chunks' && call.method === 'upsert');
    expect(upsert).toBeDefined();
    const chunkRows = upsert!.args[0] as Array<{ chunk_index: number; content: string; metadata: { researchRunId: string } }>;
    expect(chunkRows[0].chunk_index).toBe(0);
    expect(chunkRows[0].metadata.researchRunId).toBe(RUN_ID);
  });

  it('caps chunks per source', async () => {
    const client = makeSupabaseMock();
    client.on('brand_source_chunks', () => ({ data: null, error: null }));

    const page = { id: SOURCE_ID, url: 'https://example.com/', text: 'word '.repeat(60_000) };
    const count = await persistSourceChunks(client as any, { organizationId: ORG_ID, brandId: BRAND_ID, researchRunId: RUN_ID, pages: [page as any] });
    expect(count).toBeLessThanOrEqual(MAX_CHUNKS_PER_SOURCE);
  });
});

describe('runResearchPipeline', () => {
  beforeEach(() => {
    mocks.crawlBrand.mockReset();
    mocks.analyzeResearchEvidence.mockReset();
    afterHarness.callbacks.length = 0;
  });

  it('crawls, persists chunks and runs AI analysis when pages were processed', async () => {
    const client = makeSupabaseMock();
    client.on('brand_source_chunks', () => ({ data: null, error: null }));
    mocks.crawlBrand.mockResolvedValue({
      status: 'COMPLETED',
      pagesProcessed: 1,
      pagesDiscovered: 2,
      processedPages: [{ id: SOURCE_ID, url: 'https://example.com/', text: 'Aurora is a company. '.repeat(40) }],
    });
    mocks.analyzeResearchEvidence.mockResolvedValue({ status: 'SUCCEEDED', aiTaskId: null, provider: 'gemini', factsWritten: 2, insightsWritten: 1 });

    const outcome = await runResearchPipeline({ supabase: client as any, organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'https://example.com/', researchRunId: RUN_ID });

    expect(outcome).toEqual({ status: 'COMPLETED', pagesProcessed: 1, pagesDiscovered: 2, brainStatus: 'SUCCEEDED' });
    expect(mocks.crawlBrand).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ organizationId: ORG_ID, brandId: BRAND_ID, researchRunId: RUN_ID }));
    expect(mocks.analyzeResearchEvidence).toHaveBeenCalledTimes(1);
  });

  it('downgrades a completed crawl to PARTIAL when Brand Brain analysis fails', async () => {
    const client = makeSupabaseMock();
    client.on('brand_source_chunks', () => ({ data: null, error: null }));
    client.on('research_runs', () => ({ data: null, error: null }));
    mocks.crawlBrand.mockResolvedValue({
      status: 'COMPLETED',
      pagesProcessed: 2,
      pagesDiscovered: 2,
      processedPages: [{ id: SOURCE_ID, url: 'https://example.com/', text: 'Evidence '.repeat(100) }],
    });
    mocks.analyzeResearchEvidence.mockResolvedValue({
      status: 'FAILED',
      errorCode: 'RATE_LIMITED',
      errorMessage: 'Provider rate limit',
    });

    const outcome = await runResearchPipeline({
      supabase: client as any,
      organizationId: ORG_ID,
      brandId: BRAND_ID,
      websiteUrl: 'https://example.com/',
      researchRunId: RUN_ID,
    });

    expect(outcome).toEqual({
      status: 'PARTIAL',
      pagesProcessed: 2,
      pagesDiscovered: 2,
      brainStatus: 'FAILED',
    });

    const update = client.calls.find((call) => call.table === 'research_runs' && call.method === 'update');
    expect(update).toBeDefined();
    const values = update!.args[0] as { status: string; error_code: string; error_message: string };
    expect(values.status).toBe('PARTIAL');
    expect(values.error_code).toBe('RATE_LIMITED');
  });

  it('skips AI analysis when no pages were processed', async () => {
    const client = makeSupabaseMock();
    mocks.crawlBrand.mockResolvedValue({ status: 'FAILED', pagesProcessed: 0, pagesDiscovered: 3, processedPages: [] });

    const outcome = await runResearchPipeline({ supabase: client as any, organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'https://example.com/', researchRunId: RUN_ID });

    expect(outcome.brainStatus).toBe('SKIPPED');
    expect(mocks.analyzeResearchEvidence).not.toHaveBeenCalled();
  });

  it('propagates crawl failures', async () => {
    const client = makeSupabaseMock();
    mocks.crawlBrand.mockRejectedValue(new Error('crawl exploded'));

    await expect(
      runResearchPipeline({ supabase: client as any, organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'https://example.com/', researchRunId: RUN_ID }),
    ).rejects.toThrow('crawl exploded');
  });
});

describe('scheduleResearchExecution', () => {
  it('runs the pipeline via after()', async () => {
    const client = makeSupabaseMock();
    client.on('brand_source_chunks', () => ({ data: null, error: null }));
    mocks.crawlBrand.mockResolvedValue({ status: 'COMPLETED', pagesProcessed: 1, pagesDiscovered: 1, processedPages: [{ id: SOURCE_ID, url: 'https://example.com/', text: 'Text '.repeat(200) }] });
    mocks.analyzeResearchEvidence.mockResolvedValue({ status: 'SUCCEEDED', aiTaskId: null, provider: 'gemini', factsWritten: 1, insightsWritten: 1 });

    scheduleResearchExecution({ supabase: client as any, organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'https://example.com/', researchRunId: RUN_ID });

    expect(after).toHaveBeenCalledTimes(1);
    expect(afterHarness.callbacks).toHaveLength(1);
    const callbackResult = afterHarness.callbacks[0]?.();
    expect(callbackResult).toBeInstanceOf(Promise);
    await callbackResult;
    expect(mocks.crawlBrand).toHaveBeenCalledTimes(1);
    expect(client.calls.some((call) => call.table === 'research_runs')).toBe(false);
  });

  it('marks the run as FAILED when the pipeline throws', async () => {
    const client = makeSupabaseMock();
    client.on('research_runs', () => ({ data: null, error: null }));
    mocks.crawlBrand.mockRejectedValue(new Error('boom'));

    scheduleResearchExecution({ supabase: client as any, organizationId: ORG_ID, brandId: BRAND_ID, websiteUrl: 'https://example.com/', researchRunId: RUN_ID });
    await afterHarness.callbacks[0]?.();

    const update = client.calls.find((call) => call.table === 'research_runs' && call.method === 'update');
    expect(update).toBeDefined();
    const args = update!.args[0] as { status: string; error_code: string };
    expect(args.status).toBe('FAILED');
    expect(args.error_code).toBe('PIPELINE_FAILED');
  });
});