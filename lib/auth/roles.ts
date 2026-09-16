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

export const CAN_CREATE_BRANDS: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'];
export const CAN_RUN_RESEARCH: OrgRole[] = ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'];

export type AuthContext = {
  organizationId: string;
  role: OrgRole;
};

export type AuthResult =
  | { error: { status: 401; body: { error: string } }; context: null }
  | { error: { status: 403; body: { error: string } }; context: null }
  | { error: null; context: AuthContext };

export async function requireOrgRole(allowed: OrgRole[]): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: { status: 401, body: { error: 'Authentication required' } }, context: null };

  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (error || !membership) return { error: { status: 403, body: { error: 'No organization membership found' } }, context: null };
  if (!allowed.includes(membership.role as OrgRole)) return { error: { status: 403, body: { error: 'Insufficient permissions for this action' } }, context: null };

  return { error: null, context: { organizationId: membership.organization_id, role: membership.role as OrgRole } };
}