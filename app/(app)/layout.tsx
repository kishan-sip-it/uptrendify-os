import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app/shell';
import { CAN_VIEW_DASHBOARD, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isReplayOrgSlug } from '@/lib/replay';
import { obs } from '@/lib/obs/logger';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
  if (auth.error) redirect('/login');

  const supabase = await createSupabaseServerClient();
  const [userResult, organizationResult, brandsResult, profileResult] = await Promise.allSettled([
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

  const user =
    userResult.status === 'fulfilled' && !userResult.value.error
      ? userResult.value.data.user
      : null;
  const organization =
    organizationResult.status === 'fulfilled' && !organizationResult.value.error
      ? organizationResult.value.data
      : null;
  const brands =
    brandsResult.status === 'fulfilled' && !brandsResult.value.error
      ? brandsResult.value.data ?? []
      : [];
  const profile =
    profileResult.status === 'fulfilled' && !profileResult.value.error
      ? profileResult.value.data
      : null;

  if (userResult.status === 'rejected') {
    obs.error('Authenticated user lookup failed in app shell', { error: String(userResult.reason) });
  }
  if (organizationResult.status === 'rejected') {
    obs.error('Organization shell lookup failed', { organizationId: auth.context.organizationId, error: String(organizationResult.reason) });
  } else if (organizationResult.status === 'fulfilled' && organizationResult.value.error) {
    obs.error('Organization shell query failed', { organizationId: auth.context.organizationId, error: organizationResult.value.error.message });
  }
  if (brandsResult.status === 'rejected') {
    obs.error('Brand shell lookup failed', { organizationId: auth.context.organizationId, error: String(brandsResult.reason) });
  } else if (brandsResult.status === 'fulfilled' && brandsResult.value.error) {
    obs.error('Brand shell query failed', { organizationId: auth.context.organizationId, error: brandsResult.value.error.message });
  }
  if (profileResult.status === 'rejected') {
    obs.error('Profile shell lookup failed', { userId: auth.context.userId, error: String(profileResult.reason) });
  } else if (profileResult.status === 'fulfilled' && profileResult.value.error) {
    obs.error('Profile shell query failed', { userId: auth.context.userId, error: profileResult.value.error.message });
  }

  // A missing profile is an incomplete onboarding state. A transient profile
  // query error should not crash the whole application shell; route the user
  // through onboarding instead, where the profile can be repaired.
  if (!profile || profile.onboarding_completed !== true) redirect('/onboarding');

  return (
    <AppShell
      organization={{
        id: auth.context.organizationId,
        name: organization?.name ?? 'Your workspace',
        role: auth.context.role,
      }}
      brands={brands}
      userEmail={user?.email ?? ''}
      userFirstName={profile.first_name ?? null}
      replayActive={isReplayOrgSlug(organization?.slug ?? '')}
    >
      {children}
    </AppShell>
  );
}
