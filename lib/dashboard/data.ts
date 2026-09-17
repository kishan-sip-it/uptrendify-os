import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const CONTENT_REVIEW_STATUSES = ['IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED'] as const;
export const ACTIVE_RESEARCH_STATUSES = ['QUEUED', 'RUNNING'] as const;
export const ACTIVE_STRATEGY_STATUSES = ['QUEUED', 'RUNNING'] as const;
export const PENDING_SUGGESTION_STATUS = 'PENDING' as const;
export const RECENT_BRANDS_LIMIT = 4;
export const RECENT_RESEARCH_LIMIT = 6;
export const RECENT_STRATEGIES_LIMIT = 6;
export const NEXT_ACTIONS_LIMIT = 3;

export type RecentBrand = {
  id: string;
  name: string;
  website_url: string | null;
  industry: string | null;
  status: string | null;
  created_at: string;
};

export type ResearchActivity = {
  id: string;
  brand_id: string;
  brand_name: string | null;
  status: string;
  created_at: string;
  finished_at: string | null;
  error_message: string | null;
};

export type StrategyActivity = {
  id: string;
  brand_id: string;
  brand_name: string | null;
  status: string;
  version: number;
  created_at: string;
  finished_at: string | null;
};

export type DashboardCounts = {
  activeBrands: number;
  campaigns: number;
  contentNeedingReview: number;
  researchRuns: number;
  activeResearchRuns: number;
  failedResearchRuns: number;
  strategies: number;
  activeStrategies: number;
  pendingSuggestions: number;
};

export type TopPendingBrand = { id: string; name: string; count: number } | null;

export type NextAction = {
  id: string;
  kind: 'brand' | 'review' | 'research' | 'retry' | 'strategy';
  title: string;
  description: string;
  href: string;
  cta: string;
};

export type DashboardData = {
  counts: DashboardCounts;
  recentBrands: RecentBrand[];
  recentResearch: ResearchActivity[];
  recentStrategies: StrategyActivity[];
  topPendingBrand: TopPendingBrand;
  nextActions: NextAction[];
};

export class DashboardDataError extends Error {
  constructor(table: string, message: string) {
    super(`Dashboard query failed for ${table}: ${message}`);
    this.name = 'DashboardDataError';
  }
}

type QueryLike = {
  count: number | null;
  error: { message: string } | null;
};

async function exactCount(result: QueryLike, table: string): Promise<number> {
  if (result.error) throw new DashboardDataError(table, result.error.message);
  return result.count ?? 0;
}

type RowList = {
  data: unknown[] | null;
  error: { message: string } | null;
};

async function loadCounts(client: { from: SupabaseClient['from'] }, organizationId: string): Promise<DashboardCounts> {
  const brands = await client.from('brands').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'ACTIVE');
  const campaigns = await client.from('campaigns').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId);
  const contentNeedingReview = await client.from('content_items').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('status', [...CONTENT_REVIEW_STATUSES]);
  const researchRuns = await client.from('research_runs').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId);
  const activeResearchRuns = await client.from('research_runs').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('status', [...ACTIVE_RESEARCH_STATUSES]);
  const failedResearchRuns = await client.from('research_runs').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'FAILED');
  const strategies = await client.from('strategies').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId);
  const activeStrategies = await client.from('strategies').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('status', [...ACTIVE_STRATEGY_STATUSES]);
  const pendingSuggestions = await client.from('brand_suggestions').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', PENDING_SUGGESTION_STATUS);

  return {
    activeBrands: await exactCount(brands, 'brands'),
    campaigns: await exactCount(campaigns, 'campaigns'),
    contentNeedingReview: await exactCount(contentNeedingReview, 'content_items'),
    researchRuns: await exactCount(researchRuns, 'research_runs'),
    activeResearchRuns: await exactCount(activeResearchRuns, 'research_runs'),
    failedResearchRuns: await exactCount(failedResearchRuns, 'research_runs'),
    strategies: await exactCount(strategies, 'strategies'),
    activeStrategies: await exactCount(activeStrategies, 'strategies'),
    pendingSuggestions: await exactCount(pendingSuggestions, 'brand_suggestions'),
  };
}

async function loadRecentBrands(client: { from: SupabaseClient['from'] }, organizationId: string): Promise<RecentBrand[]> {
  const result = (await client
    .from('brands')
    .select('id,name,website_url,industry,status,created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(RECENT_BRANDS_LIMIT)) as RowList;

  if (result.error) throw new DashboardDataError('brands', result.error.message);
  return result.data as RecentBrand[];
}

async function loadRecentResearch(client: { from: SupabaseClient['from'] }, organizationId: string): Promise<ResearchActivity[]> {
  const result = (await client
    .from('research_runs')
    .select('id,brand_id,status,created_at,finished_at,error_message,brand:brands(id,name)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(RECENT_RESEARCH_LIMIT)) as {
    data: Array<{
      id: string;
      brand_id: string | null;
      brand: { id: string; name: string } | null;
      status: string;
      created_at: string;
      finished_at: string | null;
      error_message: string | null;
    }> | null;
    error: { message: string } | null;
  };

  if (result.error) throw new DashboardDataError('research_runs', result.error.message);

  return (result.data ?? []).map((row) => ({
    id: row.id,
    brand_id: row.brand_id ?? row.brand?.id ?? '',
    brand_name: row.brand?.name ?? null,
    status: row.status,
    created_at: row.created_at,
    finished_at: row.finished_at,
    error_message: row.error_message,
  }));
}

async function loadRecentStrategies(client: { from: SupabaseClient['from'] }, organizationId: string): Promise<StrategyActivity[]> {
  const result = (await client
    .from('strategies')
    .select('id,brand_id,status,version,created_at,finished_at,brand:brands(id,name)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(RECENT_STRATEGIES_LIMIT)) as {
    data: Array<{
      id: string;
      brand_id: string | null;
      brand: { id: string; name: string } | null;
      status: string;
      version: number;
      created_at: string;
      finished_at: string | null;
    }> | null;
    error: { message: string } | null;
  };

  if (result.error) throw new DashboardDataError('strategies', result.error.message);

  return (result.data ?? []).map((row) => ({
    id: row.id,
    brand_id: row.brand_id ?? row.brand?.id ?? '',
    brand_name: row.brand?.name ?? null,
    status: row.status,
    version: row.version,
    created_at: row.created_at,
    finished_at: row.finished_at,
  }));
}

async function loadTopPendingBrand(client: { from: SupabaseClient['from'] }, organizationId: string): Promise<TopPendingBrand> {
  const result = (await client
    .from('brand_suggestions')
    .select('status,brand_id,brand:brands(id,name)')
    .eq('organization_id', organizationId)
    .eq('status', PENDING_SUGGESTION_STATUS)
    .order('created_at', { ascending: false })
    .limit(50)) as {
    data: Array<{ brand_id: string | null; brand: { id: string; name: string } | null }> | null;
    error: { message: string } | null;
  };

  if (result.error) throw new DashboardDataError('brand_suggestions', result.error.message);

  const tallies = new Map<string, { id: string; name: string; count: number }>();
  for (const row of result.data ?? []) {
    const brandId = row.brand_id ?? row.brand?.id;
    if (!brandId) continue;
    const name = row.brand?.name ?? 'Untitled brand';
    const entry = tallies.get(brandId) ?? { id: brandId, name, count: 0 };
    entry.count += 1;
    tallies.set(brandId, entry);
  }

  let top: { id: string; name: string; count: number } | null = null;
  for (const entry of tallies.values()) {
    if (!top || entry.count > top.count) top = entry;
  }
  return top;
}

type NextActionInput = {
  counts: DashboardCounts;
  recentBrands: RecentBrand[];
  recentResearch: ResearchActivity[];
  recentStrategies: StrategyActivity[];
  topPendingBrand: TopPendingBrand;
};

export function buildNextActions(input: NextActionInput): NextAction[] {
  const { counts, recentBrands, recentResearch, recentStrategies, topPendingBrand } = input;
  const actions: NextAction[] = [];

  if (counts.activeBrands === 0) {
    actions.push({
      id: 'add-brand',
      kind: 'brand',
      title: 'Add your first brand',
      description: 'Give us a website URL and we\u2019ll start building its Brand Brain.',
      href: '/brands/new',
      cta: 'Add a brand',
    });
    return actions;
  }

  if (counts.pendingSuggestions > 0 && topPendingBrand) {
    const label = topPendingBrand.name || topPendingBrand.id;
    actions.push({
      id: 'review-suggestions',
      kind: 'review',
      title: `${counts.pendingSuggestions} suggestion${counts.pendingSuggestions === 1 ? '' : 's'} to review`,
      description: `${label} has ${topPendingBrand.count} pending intelligence field${topPendingBrand.count === 1 ? '' : 's'} — nothing becomes a fact until you approve it.`,
      href: `/brands/${topPendingBrand.id}#intelligence`,
      cta: 'Review inbox',
    });
  }

  const activeRun = recentResearch.find((run) => (ACTIVE_RESEARCH_STATUSES as readonly string[]).includes(run.status));
  if (activeRun) {
    actions.push({
      id: 'active-run',
      kind: 'research',
      title: 'Research run in progress',
      description: `${activeRun.brand_name ?? 'A brand'} is being analyzed right now — evidence streams in as pages complete.`,
      href: `/brands/${activeRun.brand_id}`,
      cta: 'View run',
    });
  }

  const failedRun = recentResearch.find((run) => run.status === 'FAILED');
  if (counts.failedResearchRuns > 0 && failedRun) {
    actions.push({
      id: 'failed-run',
      kind: 'retry',
      title: 'A research run needs attention',
      description: failedRun.error_message || 'Something went wrong while analyzing the brand. Check the run log and retry.',
      href: `/brands/${failedRun.brand_id}`,
      cta: 'Investigate',
    });
  }

  if (counts.strategies === 0 && counts.pendingSuggestions === 0 && recentBrands[0]) {
    actions.push({
      id: 'first-strategy',
      kind: 'strategy',
      title: 'Draft your first strategy',
      description: 'Once you\u2019ve approved enough brand facts, the strategy engine can generate a growth roadmap.',
      href: `/brands/${recentBrands[0].id}`,
      cta: 'Get started',
    });
  }

  return actions.slice(0, NEXT_ACTIONS_LIMIT);
}

export async function loadDashboardData(client: { from: SupabaseClient['from'] }, organizationId: string): Promise<DashboardData> {
  const [counts, recentBrands, recentResearch, recentStrategies, topPendingBrand] = await Promise.all([
    loadCounts(client, organizationId),
    loadRecentBrands(client, organizationId),
    loadRecentResearch(client, organizationId),
    loadRecentStrategies(client, organizationId),
    loadTopPendingBrand(client, organizationId),
  ]);

  const nextActions = buildNextActions({ counts, recentBrands, recentResearch, recentStrategies, topPendingBrand });

  return { counts, recentBrands, recentResearch, recentStrategies, topPendingBrand, nextActions };
}

export async function fetchOrganizationDashboardData(organizationId: string): Promise<DashboardData> {
  const client = await createSupabaseServerClient();
  return loadDashboardData(client, organizationId);
}