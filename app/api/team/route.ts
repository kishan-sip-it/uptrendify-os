import { NextResponse } from 'next/server';
import {
  ASSIGNABLE_ROLES_BY_ROLE,
  CAN_INVITE_MEMBERS,
  CAN_MANAGE_MEMBERS,
  CAN_REMOVE_MEMBER,
  CAN_UPDATE_MEMBER_ROLE,
  CAN_VIEW_TEAM,
  INVITABLE_ROLES,
  requireOrgRole,
} from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';

export async function GET() {
  try {
    const auth = await requireOrgRole(CAN_VIEW_TEAM);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const organizationId = auth.context.organizationId;

    const membersResult = await supabase.rpc('list_organization_members_with_email', {
      p_organization_id: organizationId,
    });
    if (membersResult.error) throw membersResult.error;

    let invitations: unknown[] = [];
    if (CAN_MANAGE_MEMBERS.includes(auth.context.role)) {
      const invitationsResult = await supabase
        .from('organization_invitations')
        .select('id, invited_email, role, invited_by, expires_at, accepted_at, revoked_at, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (invitationsResult.error) throw invitationsResult.error;
      invitations = invitationsResult.data ?? [];
    }

    return NextResponse.json(
      {
        organizationId,
        members: membersResult.data ?? [],
        invitations,
        permissions: {
          canInviteMembers: CAN_INVITE_MEMBERS.includes(auth.context.role),
          canUpdateMemberRole: CAN_UPDATE_MEMBER_ROLE.includes(auth.context.role),
          canRemoveMember: CAN_REMOVE_MEMBER.includes(auth.context.role),
          inviteRoles: INVITABLE_ROLES,
          assignableRoles: ASSIGNABLE_ROLES_BY_ROLE[auth.context.role],
          myRole: auth.context.role,
          myUserId: auth.context.userId,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    obs.error('Team load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load your team' }, { status: 500 });
  }
}