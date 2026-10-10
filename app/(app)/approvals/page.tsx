import { redirect } from 'next/navigation';
import { CAN_VIEW_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApprovalsQueue } from './queue';
import { PageHeader } from '@/components/ui/page-header';

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
      <PageHeader eyebrow="Review & control" title="Approvals" description="Content in review and ready for publishing across your organization. Decisions here are version-exact and auditable." />
      <ApprovalsQueue />
    </main>
  );
}