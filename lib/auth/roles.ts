import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const ROLES = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  STRATEGIST: 'STRATEGIST',
  EDITOR: 'EDITOR',
  APPROVER: 'APPROVER',
  CLIENT: 'CLIENT',
} as const;

export type OrgRole = (typeof ROLES)[keyof typeof ROLES];

export const ORG_SWITCH_COOKIE = 'uptrendify_org';

export const CAN_CREATE_BRANDS: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'];
export const CAN_RUN_RESEARCH: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'];
export const CAN_GENERATE_STRATEGY: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'];
export const CAN_REVIEW_SUGGESTIONS: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'];
export const CAN_REVIEW_STRATEGIES: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'APPROVER'];
export const CAN_VIEW_DASHBOARD: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'];
export const CAN_VIEW_BRAND: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'];
export const CAN_GENERATE_CONTENT: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'];
export const CAN_REVIEW_CONTENT: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'APPROVER'];
export const CAN_VIEW_CONTENT: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT'];

export type AuthContext = {
  organizationId: string;
  role: OrgRole;
  userId: string;
};

export type AuthResult =
  | { error: { status: 401; body: { error: string } }; context: null }
  | { error: { status: 403; body: { error: string } }; context: null }
  | { error: { status: 500; body: { error: string } }; context: null }
  | { error: null; context: AuthContext };

export async function requireOrgRole(allowed: OrgRole[]): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: { status: 401, body: { error: 'Authentication required' } }, context: null };

  const cookieStore = await cookies();
  const preferredOrgId = cookieStore.get(ORG_SWITCH_COOKIE)?.value ?? null;

  const { data: memberships, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .order('organization_id', { ascending: true })
    .limit(50);

  if (error) return { error: { status: 500, body: { error: 'Failed to resolve organization membership' } }, context: null };

  let membership: { organization_id: string; role: string } | undefined;
  if (preferredOrgId) membership = memberships?.find((row) => row.organization_id === preferredOrgId);
  if (!membership) membership = memberships?.[0];

  if (!membership) return { error: { status: 403, body: { error: 'No organization membership found' } }, context: null };
  if (!allowed.includes(membership.role as OrgRole)) return { error: { status: 403, body: { error: 'Insufficient permissions for this action' } }, context: null };

  return { error: null, context: { organizationId: membership.organization_id, role: membership.role as OrgRole, userId: user.id } };
}