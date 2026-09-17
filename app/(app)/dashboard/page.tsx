import { ArrowUpRight } from 'lucide-react';
import { DashboardContent } from '@/components/dashboard/dashboard-content';
import { CAN_VIEW_DASHBOARD, requireOrgRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
  if (auth.error) return null;

  return (
    <>
      <DashboardContent />
      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">
          <div>
            <div className="eyebrow">Golden workflow</div>
            <h2 style={{ margin: '5px 0' }}>URL → Brand Brain → Growth Plan → Content</h2>
          </div>
          <a className="badge" href="/brands/new">Open workflow <ArrowUpRight size={13} /></a>
        </div>
        <p className="subtitle">The first production workflow onboards a brand from its public website, stores evidence, builds an editable Brand Brain, then uses that context for strategy and content.</p>
      </div>
    </>
  );
}