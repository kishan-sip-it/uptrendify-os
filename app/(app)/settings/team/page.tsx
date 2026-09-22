import { redirect } from 'next/navigation';
import { CAN_VIEW_TEAM, requireOrgRole } from '@/lib/auth/roles';
import { TeamSettings } from '@/components/settings/team-settings';

export const dynamic = 'force-dynamic';

export default async function TeamSettingsPage() {
  const auth = await requireOrgRole(CAN_VIEW_TEAM);
  if (auth.error) redirect('/login');

  return (
    <main className="main" style={{ maxWidth: 1100 }}>
      <div className="topbar" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Workspace</div>
          <h1 style={{ margin: '4px 0' }}>Team</h1>
          <p className="subtitle">Members and invitations for your agency workspace.</p>
        </div>
      </div>
      <TeamSettings />
    </main>
  );
}