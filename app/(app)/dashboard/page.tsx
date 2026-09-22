import { ArrowUpRight } from 'lucide-react';
import { DashboardContent } from '@/components/dashboard/dashboard-content';
import { WorkflowProgress } from '@/components/workflow/workflow-progress';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return (
    <>
      <WorkflowProgress />
      <DashboardContent />
      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">
          <div>
            <div className="eyebrow">The product loop</div>
            <h2>Understand → plan → create → approve → publish</h2>
          </div>
          <a className="badge" href="/brands/new">Open workflow <ArrowUpRight size={13} /></a>
        </div>
        <p className="subtitle">Research tells you what the business does. Brand Intelligence organizes what AI discovered. Strategy decides what to do, Content creates the assets, Campaigns organize them, Approval protects quality, and Publishing prepares approved work for external channels.</p>
      </div>
    </>
  );
}
