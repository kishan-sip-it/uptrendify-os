import { NextResponse } from 'next/server';
import { CAN_VIEW_DASHBOARD, requireOrgRole } from '@/lib/auth/roles';
import { fetchOrganizationDashboardData } from '@/lib/dashboard/data';
import { obs } from '@/lib/obs/logger';

export async function GET() {
  const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
  if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

  try {
    const data = await fetchOrganizationDashboardData(auth.context.organizationId);
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    obs.error('Dashboard data could not be loaded', {
      organizationId: auth.context.organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Could not load dashboard data' }, { status: 500 });
  }
}