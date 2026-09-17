import { ArrowUpRight, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/auth/logout-button';
import { DashboardContent } from '@/components/dashboard/dashboard-content';
import { CAN_VIEW_DASHBOARD, requireOrgRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
  if (auth.error) redirect('/login');

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand-mark"><span className="logo" /> UpTrendifyOS</div>
        <nav className="nav">
          {['Dashboard', 'Clients', 'Brands', 'Strategy', 'Content Studio', 'Campaigns', 'Approvals', 'AI Command Center', 'Settings'].map((item, i) => (
            <a className={`nav-item ${i === 0 ? 'active' : ''}`} href="#" key={item}>{item}</a>
          ))}
        </nav>
        <div className="card" style={{ marginTop: 28 }}>
          <div className="eyebrow">AI COMMAND</div>
          <p style={{ marginBottom: 8 }}>Ask UpTrendifyOS to find your next growth opportunity.</p>
          <div className="badge"><Sparkles size={13} /> Agent ready</div>
        </div>
        <div style={{ marginTop: 20 }}><LogoutButton /></div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <div className="eyebrow">Agency command center</div>
            <h1>Good morning, growth team.</h1>
            <p className="subtitle">One operating system for research, brand intelligence, strategy, content and campaign execution across every client brand.</p>
          </div>
          <a className="badge" href="/brands/new"><Sparkles size={14} /> Add brand</a>
        </div>

        <DashboardContent />

        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title"><div><div className="eyebrow">Golden workflow</div><h2 style={{ margin: '5px 0' }}>URL → Brand Brain → Growth Plan → Content</h2></div><a className="badge" href="/brands/new">Open workflow <ArrowUpRight size={13} /></a></div>
          <p className="subtitle">The first production workflow onboards a brand from its public website, stores evidence, builds an editable Brand Brain, then uses that context for strategy and content.</p>
        </div>
      </section>
    </main>
  );
}