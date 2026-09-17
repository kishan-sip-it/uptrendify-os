import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/roles', () => ({
  CAN_VIEW_DASHBOARD: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'],
  requireOrgRole: vi.fn(),
}));

vi.mock('@/lib/dashboard/data', () => ({
  fetchOrganizationDashboardData: vi.fn(),
}));

import { GET } from './route';
import { requireOrgRole } from '@/lib/auth/roles';
import { fetchOrganizationDashboardData } from '@/lib/dashboard/data';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

const SAMPLE_DATA = {
  counts: {
    activeBrands: 3,
    campaigns: 5,
    contentNeedingReview: 1,
    researchRuns: 7,
    activeResearchRuns: 0,
    failedResearchRuns: 0,
  },
  recentBrands: [],
  recentResearch: [],
};

const require = vi.mocked(requireOrgRole);
const fetchData = vi.mocked(fetchOrganizationDashboardData);

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the user is not authenticated', async () => {
    require.mockResolvedValue({ error: { status: 401, body: { error: 'Authentication required' } }, context: null });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required' });
    expect(fetchData).not.toHaveBeenCalled();
  });

  it('returns 403 when the user has no organization membership', async () => {
    require.mockResolvedValue({ error: { status: 403, body: { error: 'No organization membership found' } }, context: null });

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'No organization membership found' });
    expect(fetchData).not.toHaveBeenCalled();
  });

  it('returns the authenticated organization dashboard data', async () => {
    require.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'OWNER' } });
    fetchData.mockResolvedValue(SAMPLE_DATA);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true, data: SAMPLE_DATA });
    expect(fetchData).toHaveBeenCalledWith(ORG_ID);
  });

  it('returns 500 when the dashboard query fails, without leaking details', async () => {
    require.mockResolvedValue({ error: null, context: { organizationId: ORG_ID, role: 'OWNER' } });
    fetchData.mockRejectedValue(new Error('connection refused'));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Could not load dashboard data' });
  });
});