import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const CONTENT_REVIEW_STATUSES = ['IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED'] as const;
export const ACTIVE_RESEARCH_STATUSES = ['QUEUED', 'RUNNING'] as const;
export const RECENT_BRANDS_LIMIT = 4;
export const RECENT_RESEARCH_LIMIT = 6;

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

export type DashboardCounts = {
  activeBrands: number;
  campaigns: number;
  contentNeedingReview: number;
  researchRuns: number;
  activeResearchRuns: number;
  failedResearchRuns: number;
};

export type DashboardData = {
  counts: DashboardCounts;
  recentBrands: RecentBrand[];
  recentResearch: ResearchActivity[];
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

  return {
    activeBrands: await exactCount(brands, 'brands'),
    campaigns: await exactCount(campaigns, 'campaigns'),
    contentNeedingReview: await exactCount(contentNeedingReview, 'content_items'),
    researchRuns: await exactCount(researchRuns, 'research_runs'),
    activeResearchRuns: await exactCount(activeResearchRuns, 'research_runs'),
    failedResearchRuns: await exactCount(failedResearchRuns, 'research_runs'),
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

export async function loadDashboardData(client: { from: SupabaseClient['from'] }, organizationId: string): Promise<DashboardData> {
  const [counts, recentBrands, recentResearch] = await Promise.all([
    loadCounts(client, organizationId),
    loadRecentBrands(client, organizationId),
    loadRecentResearch(client, organizationId),
  ]);

  return { counts, recentBrands, recentResearch };
}

export async function fetchOrganizationDashboardData(organizationId: string): Promise<DashboardData> {
  const client = await createSupabaseServerClient();
  return loadDashboardData(client, organizationId);
}