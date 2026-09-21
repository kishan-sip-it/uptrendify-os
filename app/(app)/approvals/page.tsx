import { redirect } from 'next/navigation';
import { CAN_VIEW_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApprovalsQueue } from './queue';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const auth = await requireOrgRole(CAN_VIEW_CONTENT);
  if (auth.error) redirect('/login');

  const supabase = await createSupabaseServerClient();
  const brandsResult = await supabase
    .from('brands')
    .select('id')
    .eq('organization_id', auth.context.organizationId)
    .limit(1);
  if (brandsResult.error) throw brandsResult.error;
  if ((brandsResult.data ?? []).length === 0) redirect('/brands/new');

  return (
    <main className="main">
      <div className="topbar" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginTop: 8 }}>Approvals</h1>
          <p className="subtitle">
            Content in review and ready for publishing across your organization. Decisions here are version-exact and auditable.
          </p>
        </div>
      </div>
      <ApprovalsQueue />
    </main>
  );
}