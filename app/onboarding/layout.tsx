import { redirect } from 'next/navigation';
import { CAN_VIEW_DASHBOARD, requireOrgRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
  if (auth.error) redirect('/login');

  return children;
}
