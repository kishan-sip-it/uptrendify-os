import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { loadDashboardData, DashboardDataError, CONTENT_REVIEW_STATUSES, ACTIVE_RESEARCH_STATUSES, RECENT_BRANDS_LIMIT, RECENT_RESEARCH_LIMIT } from './data';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const BRAND_ID = '00000000-0000-0000-0000-000000000002';
const RUN_ID = '00000000-0000-0000-0000-000000000003';

type Op = { table: string; method: string; args: unknown[] };

function chain(result: unknown, table: string, ops: Op[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
    builder[method] = (arg1: unknown, arg2?: unknown) => {
      ops.push({ table, method, args: [arg1, arg2] });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => void) => resolve(result);
  return builder;
}

type Counts = { activeBrands: number; campaigns: number; contentNeedingReview: number; researchRuns: number; activeResearchRuns: number; failedResearchRuns: number };

function mockClient(setup: { counts?: Partial<Counts>; recentBrands?: unknown[]; recentResearch?: unknown[] }) {
  const countResult = (count: number) => ({ data: null, count, error: null });
  const totals: Counts = {
    activeBrands: 0,
    campaigns: 0,
    contentNeedingReview: 0,
    researchRuns: 0,
    activeResearchRuns: 0,
    failedResearchRuns: 0,
    ...setup.counts,
  };

  const queues: Record<string, Array<() => unknown>> = {
    brands: [() => countResult(totals.activeBrands), () => ({ data: setup.recentBrands ?? [], error: null })],
    campaigns: [() => countResult(totals.campaigns)],
    content_items: [() => countResult(totals.contentNeedingReview)],
    research_runs: [
      () => ({ data: setup.recentResearch ?? [], error: null }),
      () => countResult(totals.researchRuns),
      () => countResult(totals.activeResearchRuns),
      () => countResult(totals.failedResearchRuns),
    ],
  };

  const ops: Op[] = [];
  const from = vi.fn((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`No mock result queued for ${table}`);
    return chain(next(), table, ops);
  });

  return { from, ops };
}

describe('loadDashboardData', () => {
  it('aggregates counts from queries scoped to the organization', async () => {
    const client = mockClient({
      counts: { activeBrands: 5, campaigns: 3, contentNeedingReview: 2, researchRuns: 9, activeResearchRuns: 2, failedResearchRuns: 1 },
    });

    const data = await loadDashboardData(client as never, ORG_ID);

    expect(data.counts).toEqual({
      activeBrands: 5,
      campaigns: 3,
      contentNeedingReview: 2,
      researchRuns: 9,
      activeResearchRuns: 2,
      failedResearchRuns: 1,
    });

    const scopedTables = new Set(client.ops.filter((op) => op.method === 'eq' && op.args[0] === 'organization_id').map((op) => op.table));
    expect(scopedTables).toEqual(new Set(['brands', 'campaigns', 'content_items', 'research_runs']));

    const brandEqs = client.ops.filter((op) => op.table === 'brands' && op.method === 'eq');
    expect(brandEqs).toContainEqual({ table: 'brands', method: 'eq', args: ['status', 'ACTIVE'] });

    const contentIns = client.ops.find((op) => op.table === 'content_items' && op.method === 'in');
    expect(contentIns?.args[1]).toEqual([...CONTENT_REVIEW_STATUSES]);

    const researchIns = client.ops.find((op) => op.table === 'research_runs' && op.method === 'in');
    expect(researchIns?.args[1]).toEqual([...ACTIVE_RESEARCH_STATUSES]);

    const failedEq = client.ops.find((op) => op.table === 'research_runs' && op.method === 'eq' && op.args[0] === 'status');
    expect(failedEq?.args[1]).toBe('FAILED');
  });

  it('returns recent brands ordered newest-first and limited', async () => {
    const recentBrands = [
      { id: 'a', name: 'Aurora', website_url: 'https://aurora.dev', industry: 'B2B SaaS', status: 'ACTIVE', created_at: '2026-09-10T10:00:00.000Z' },
      { id: 'b', name: 'Nova Health', website_url: 'https://nova.health', industry: 'Healthcare', status: 'ACTIVE', created_at: '2026-09-01T10:00:00.000Z' },
    ];
    const client = mockClient({ recentBrands });

    const data = await loadDashboardData(client as never, ORG_ID);

    expect(data.recentBrands).toEqual(recentBrands);

    const order = client.ops.find((op) => op.table === 'brands' && op.method === 'order');
    expect(order?.args).toEqual(['created_at', { ascending: false }]);
    const limit = client.ops.find((op) => op.table === 'brands' && op.method === 'limit');
    expect(limit?.args[0]).toBe(RECENT_BRANDS_LIMIT);
  });

  it('maps recent research runs and flattens the brand relation', async () => {
    const recentResearch = [
      { id: RUN_ID, brand_id: BRAND_ID, brand: { id: BRAND_ID, name: 'Aurora' }, status: 'COMPLETED', created_at: '2026-09-12T08:00:00.000Z', finished_at: '2026-09-12T08:05:00.000Z', error_message: null },
      { id: 'run-2', brand_id: null, brand: { id: 'brand-2', name: 'Nova Health' }, status: 'FAILED', created_at: '2026-09-11T08:00:00.000Z', finished_at: null, error_message: 'No pages could be processed' },
    ];
    const client = mockClient({ recentResearch });

    const data = await loadDashboardData(client as never, ORG_ID);

    expect(data.recentResearch).toEqual([
      { id: RUN_ID, brand_id: BRAND_ID, brand_name: 'Aurora', status: 'COMPLETED', created_at: '2026-09-12T08:00:00.000Z', finished_at: '2026-09-12T08:05:00.000Z', error_message: null },
      { id: 'run-2', brand_id: 'brand-2', brand_name: 'Nova Health', status: 'FAILED', created_at: '2026-09-11T08:00:00.000Z', finished_at: null, error_message: 'No pages could be processed' },
    ]);

    const order = client.ops.find((op) => op.table === 'research_runs' && op.method === 'order');
    expect(order?.args).toEqual(['created_at', { ascending: false }]);
    const limit = client.ops.find((op) => op.table === 'research_runs' && op.method === 'limit');
    expect(limit?.args[0]).toBe(RECENT_RESEARCH_LIMIT);
  });

  it('throws DashboardDataError when a Supabase query reports an error', async () => {
    const client = mockClient({});
    client.ops.length = 0;

    const failing = { from: vi.fn(() => chain({ data: null, count: null, error: { message: 'connection refused' } }, 'brands', [])) };
    await expect(loadDashboardData(failing as never, ORG_ID)).rejects.toThrow(DashboardDataError);
    await expect(loadDashboardData(failing as never, ORG_ID)).rejects.toThrow(/connection refused/);
  });
});