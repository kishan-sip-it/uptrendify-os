import { redirect } from 'next/navigation';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ContentHubPage() {
  const auth = await requireOrgRole(CAN_VIEW_BRAND);
  if (auth.error) redirect('/login');

  const supabase = await createSupabaseServerClient();
  const { data: brands } = await supabase
    .from('brands')
    .select('id')
    .eq('organization_id', auth.context.organizationId)
    .order('created_at', { ascending: true })
    .limit(1);

  const first = brands?.[0];
  if (!first) redirect('/brands/new');
  redirect(`/brands/${first.id}/content`);
}