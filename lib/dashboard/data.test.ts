import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { loadDashboardData, DashboardDataError, CONTENT_REVIEW_STATUSES, ACTIVE_RESEARCH_STATUSES, RECENT_BRANDS_LIMIT, RECENT_RESEARCH_LIMIT, RECENT_STRATEGIES_LIMIT, buildNextActions } from './data';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const BRAND_ID = '00000000-0000-0000-0000-000000000002';
const RUN_ID = '00000000-0000-0000-0000-000000000003';
const STRATEGY_ID = '00000000-0000-0000-0000-000000000004';

type Op = { table: string; method: string; args: unknown[] };

type Counts = { activeBrands: number; campaigns: number; contentNeedingReview: number; researchRuns: number; activeResearchRuns: number; failedResearchRuns: number; strategies: number; activeStrategies: number; pendingSuggestions: number };

function mockClient(setup: { counts?: Partial<Counts>; recentBrands?: unknown[]; recentResearch?: unknown[]; recentStrategies?: unknown[]; pendingSuggestions?: unknown[] }) {
  const totals: Counts = {
    activeBrands: 0,
    campaigns: 0,
    contentNeedingReview: 0,
    researchRuns: 0,
    activeResearchRuns: 0,
    failedResearchRuns: 0,
    strategies: 0,
    activeStrategies: 0,
    pendingSuggestions: 0,
    ...setup.counts,
  };

  const rowCounts: Record<Exclude<keyof Counts, 'researchRuns' | 'strategies'>, number> = {
    activeBrands: totals.activeBrands,
    campaigns: totals.campaigns,
    contentNeedingReview: totals.contentNeedingReview,
    activeResearchRuns: totals.activeResearchRuns,
    failedResearchRuns: totals.failedResearchRuns,
    activeStrategies: totals.activeStrategies,
    pendingSuggestions: totals.pendingSuggestions,
  };

  const listResults: Record<string, () => unknown> = {
    brands: () => setup.recentBrands ?? [],
    research_runs: () => setup.recentResearch ?? [],
    strategies: () => setup.recentStrategies ?? [],
    brand_suggestions: () => setup.pendingSuggestions ?? [],
  };

  const countFor = (table: string, local: Op[]): number => {
    const inOp = local.find((op) => op.method === 'in');
    const inStatuses = (inOp?.args[1] as string[] | undefined) ?? [];
    const eqStatus = local.find((op) => op.method === 'eq' && op.args[0] === 'status')?.args[1] as string | undefined;
    if (inStatuses.includes('QUEUED') && inStatuses.includes('RUNNING')) return inOp!.table === 'research_runs' ? totals.activeResearchRuns : totals.activeStrategies;
    if (eqStatus === 'ACTIVE') return totals.activeBrands;
    if (eqStatus === 'FAILED') return totals.failedResearchRuns;
    if (eqStatus === 'PENDING') return totals.pendingSuggestions;
    switch (table) {
      case 'brands':
        return totals.activeBrands;
      case 'campaigns':
        return totals.campaigns;
      case 'content_items':
        return totals.contentNeedingReview;
      case 'research_runs':
        return totals.researchRuns;
      case 'brand_suggestions':
        return totals.pendingSuggestions;
      default:
        return totals.strategies;
    }
  };

  const resultFor = (table: string, local: Op[]) => {
    const select = local.find((op) => op.method === 'select');
    const isCount = Boolean(select?.args[1] && typeof select.args[1] === 'object' && 'count' in (select.args[1] as object));
    if (isCount) return { data: null, count: countFor(table, local), error: null };
    return { data: listResults[table]?.() ?? [], error: null };
  };

  const ops: Op[] = [];
  const from = vi.fn((table: string) => {
    const local: Op[] = [];
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
      builder[method] = (arg1: unknown, arg2?: unknown) => {
        const op = { table, method, args: [arg1, arg2] };
        ops.push(op);
        local.push(op);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => void) => resolve(resultFor(table, local));
    return builder;
  });

  return { from, ops };
}

describe('loadDashboardData', () => {
  it('aggregates counts from queries scoped to the organization', async () => {
    const client = mockClient({
      counts: { activeBrands: 5, campaigns: 3, contentNeedingReview: 2, researchRuns: 9, activeResearchRuns: 2, failedResearchRuns: 1, strategies: 4, activeStrategies: 1, pendingSuggestions: 7 },
    });

    const data = await loadDashboardData(client as never, ORG_ID);

    expect(data.counts).toEqual({
      activeBrands: 5,
      campaigns: 3,
      contentNeedingReview: 2,
      researchRuns: 9,
      activeResearchRuns: 2,
      failedResearchRuns: 1,
      strategies: 4,
      activeStrategies: 1,
      pendingSuggestions: 7,
    });

    const scopedTables = new Set(client.ops.filter((op) => op.method === 'eq' && op.args[0] === 'organization_id').map((op) => op.table));
    expect(scopedTables).toEqual(new Set(['brands', 'campaigns', 'content_items', 'research_runs', 'strategies', 'brand_suggestions']));

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

  it('maps recent strategies and flattens the brand relation', async () => {
    const recentStrategies = [
      { id: STRATEGY_ID, brand_id: BRAND_ID, brand: { id: BRAND_ID, name: 'Aurora' }, status: 'SUCCEEDED', version: 3, created_at: '2026-09-13T08:00:00.000Z', finished_at: '2026-09-13T08:10:00.000Z' },
      { id: 'strat-2', brand_id: null, brand: { id: 'brand-2', name: 'Nova Health' }, status: 'FAILED', version: 1, created_at: '2026-09-11T08:00:00.000Z', finished_at: null },
    ];
    const client = mockClient({ recentStrategies });

    const data = await loadDashboardData(client as never, ORG_ID);

    expect(data.recentStrategies).toEqual([
      { id: STRATEGY_ID, brand_id: BRAND_ID, brand_name: 'Aurora', status: 'SUCCEEDED', version: 3, created_at: '2026-09-13T08:00:00.000Z', finished_at: '2026-09-13T08:10:00.000Z' },
      { id: 'strat-2', brand_id: 'brand-2', brand_name: 'Nova Health', status: 'FAILED', version: 1, created_at: '2026-09-11T08:00:00.000Z', finished_at: null },
    ]);

    const order = client.ops.find((op) => op.table === 'strategies' && op.method === 'order');
    expect(order?.args).toEqual(['created_at', { ascending: false }]);
    const limit = client.ops.find((op) => op.table === 'strategies' && op.method === 'limit');
    expect(limit?.args[0]).toBe(RECENT_STRATEGIES_LIMIT);
  });

  it('throws DashboardDataError when a Supabase query reports an error', async () => {
    const failing = {
      from: vi.fn((table: string) => {
        const builder: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'in', 'order', 'limit']) builder[method] = () => builder;
        builder.then = (resolve: (value: unknown) => void) => resolve({ data: null, count: null, error: { message: 'connection refused' } });
        return builder;
      }),
    };
    await expect(loadDashboardData(failing as never, ORG_ID)).rejects.toThrow(DashboardDataError);
    await expect(loadDashboardData(failing as never, ORG_ID)).rejects.toThrow(/connection refused/);
  });

  it('tallies the brand with the most pending suggestions', async () => {
    const pendingSuggestions = [
      { brand_id: 'brand-b', brand: { id: 'brand-b', name: 'Nova Health' } },
      { brand_id: 'brand-b', brand: { id: 'brand-b', name: 'Nova Health' } },
      { brand_id: null, brand: { id: 'brand-a', name: 'Aurora' } },
    ];
    const client = mockClient({ pendingSuggestions });

    const data = await loadDashboardData(client as never, ORG_ID);

    expect(data.topPendingBrand).toEqual({ id: 'brand-b', name: 'Nova Health', count: 2 });
  });

  it('recommends adding a first brand when the portfolio is empty', () => {
    const actions = buildNextActions({
      counts: { activeBrands: 0, campaigns: 0, contentNeedingReview: 0, researchRuns: 0, activeResearchRuns: 0, failedResearchRuns: 0, strategies: 0, activeStrategies: 0, pendingSuggestions: 0 },
      recentBrands: [],
      recentResearch: [],
      recentStrategies: [],
      topPendingBrand: null,
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: 'brand', href: '/brands/new' });
  });

  it('prioritizes reviewing suggestions, then active and failed runs', () => {
    const actions = buildNextActions({
      counts: {
        activeBrands: 3,
        campaigns: 1,
        contentNeedingReview: 0,
        researchRuns: 4,
        activeResearchRuns: 1,
        failedResearchRuns: 1,
        strategies: 0,
        activeStrategies: 0,
        pendingSuggestions: 5,
      },
      recentBrands: [{ id: 'brand-a', name: 'Aurora', website_url: 'https://aurora.dev', industry: null, status: 'ACTIVE', created_at: '2026-09-10T10:00:00.000Z' }],
      recentResearch: [
        { id: 'run-1', brand_id: 'brand-b', brand_name: 'Nova Health', status: 'RUNNING', created_at: '2026-09-14T10:00:00.000Z', finished_at: null, error_message: null },
        { id: 'run-0', brand_id: 'brand-a', brand_name: 'Aurora', status: 'FAILED', created_at: '2026-09-13T10:00:00.000Z', finished_at: '2026-09-13T10:01:00.000Z', error_message: 'timeout' },
      ],
      recentStrategies: [],
      topPendingBrand: { id: 'brand-a', name: 'Aurora', count: 4 },
    });

    expect(actions.map((action) => action.id)).toEqual(['review-suggestions', 'active-run', 'failed-run']);
    expect(actions[0].href).toBe('/brands/brand-a#intelligence');
    expect(actions[0].cta).toBe('Review inbox');
  });

  it('caps recommended actions and suggests a first strategy when idle', () => {
    const actions = buildNextActions({
      counts: {
        activeBrands: 2,
        campaigns: 0,
        contentNeedingReview: 0,
        researchRuns: 1,
        activeResearchRuns: 0,
        failedResearchRuns: 0,
        strategies: 0,
        activeStrategies: 0,
        pendingSuggestions: 0,
      },
      recentBrands: [{ id: 'brand-a', name: 'Aurora', website_url: 'https://aurora.dev', industry: null, status: 'ACTIVE', created_at: '2026-09-10T10:00:00.000Z' }],
      recentResearch: [],
      recentStrategies: [],
      topPendingBrand: null,
    });

    expect(actions.map((action) => action.id)).toEqual(['first-strategy']);
    expect(actions[0].kind).toBe('strategy');
    expect(actions[0].href).toBe('/brands/brand-a');
  });
});