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

  // Authorization above is the hard requirement. Workspace/profile/brand
  // presentation data is best-effort so a transient Supabase read cannot turn
  // the whole authenticated application into a global Next.js error page.
  let organization = { name: 'Your workspace', slug: '' as string | null };
  let brands: Array<{ id: string; name: string; website_url: string | null; status: string | null }> = [];
  let userEmail = '';
  let userFirstName: string | null = null;
  let onboardingCompleted = true;

  try {
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

    if (userResult.status === 'fulfilled' && !userResult.value.error) {
      userEmail = userResult.value.data.user?.email ?? '';
    }
    if (organizationResult.status === 'fulfilled' && !organizationResult.value.error && organizationResult.value.data) {
      organization = organizationResult.value.data;
    }
    if (brandsResult.status === 'fulfilled' && !brandsResult.value.error) {
      brands = brandsResult.value.data ?? [];
    }
    if (profileResult.status === 'fulfilled' && !profileResult.value.error && profileResult.value.data) {
      userFirstName = profileResult.value.data.first_name ?? null;
      onboardingCompleted = profileResult.value.data.onboarding_completed === true;
    } else if (profileResult.status === 'fulfilled' && profileResult.value.data === null) {
      onboardingCompleted = false;
    }

    if (userResult.status === 'rejected') {
      obs.error('Authenticated user lookup failed in app shell', { error: String(userResult.reason) });
    }
    if (organizationResult.status === 'rejected' || (organizationResult.status === 'fulfilled' && organizationResult.value.error)) {
      obs.error('Organization shell lookup failed', {
        organizationId: auth.context.organizationId,
        error: organizationResult.status === 'rejected'
          ? String(organizationResult.reason)
          : organizationResult.value.error?.message,
      });
    }
    if (brandsResult.status === 'rejected' || (brandsResult.status === 'fulfilled' && brandsResult.value.error)) {
      obs.error('Brand shell lookup failed', {
        organizationId: auth.context.organizationId,
        error: brandsResult.status === 'rejected'
          ? String(brandsResult.reason)
          : brandsResult.value.error?.message,
      });
    }
    if (profileResult.status === 'rejected' || (profileResult.status === 'fulfilled' && profileResult.value.error)) {
      obs.error('Profile shell lookup failed', {
        userId: auth.context.userId,
        error: profileResult.status === 'rejected'
          ? String(profileResult.reason)
          : profileResult.value.error?.message,
      });
    }
  } catch (error) {
    // Authorization already succeeded, so keep the shell usable even when
    // optional workspace hydration fails. Profile absence still routes to
    // onboarding below when we were able to inspect it.
    obs.error('App shell hydration failed', {
      organizationId: auth.context.organizationId,
      userId: auth.context.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!onboardingCompleted) redirect('/onboarding');

  let replayActive = false;
  try {
    replayActive = isReplayOrgSlug(organization.slug ?? '');
  } catch (error) {
    obs.error('Replay mode configuration could not be evaluated', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return (
    <AppShell
      organization={{
        id: auth.context.organizationId,
        name: organization.name || 'Your workspace',
        role: auth.context.role,
      }}
      brands={brands}
      userEmail={userEmail}
      userFirstName={userFirstName}
      replayActive={replayActive}
    >
      {children}
    </AppShell>
  );
}
