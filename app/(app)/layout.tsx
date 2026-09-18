import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app/shell';
import { CAN_VIEW_DASHBOARD, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isReplayOrgSlug } from '@/lib/replay';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
  if (auth.error) redirect('/login');

  const supabase = await createSupabaseServerClient();
  const [{ data: { user } }, organizationResult, brandsResult, profileResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('organizations')
      .select('name,slug')
      .eq('id', auth.context.organizationId)
      .maybeSingle(),
    supabase
      .from('brands')
      .select('id,name,website_url,status')
      .eq('organization_id', auth.context.organizationId)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase
      .from('user_profiles')
      .select('first_name,last_name,onboarding_completed')
      .eq('user_id', auth.context.userId)
      .maybeSingle(),
  ]);

  if (profileResult.data && !profileResult.data.onboarding_completed) redirect('/onboarding');

  return (
    <AppShell
      organization={{
        id: auth.context.organizationId,
        name: organizationResult.data?.name ?? 'Your workspace',
        role: auth.context.role,
      }}
      brands={brandsResult.data ?? []}
      userEmail={user?.email ?? ''}
      userFirstName={profileResult.data?.first_name ?? null}
      replayActive={isReplayOrgSlug(organizationResult.data?.slug ?? '')}
    >
      {children}
    </AppShell>
  );
}