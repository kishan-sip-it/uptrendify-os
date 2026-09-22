import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CAN_REMOVE_MEMBER, CAN_UPDATE_MEMBER_ROLE, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';
import { mapRpcError } from '@/lib/team/rpc-error';

const paramsSchema = z.object({ userId: z.string().uuid() });
const roleSchema = z.object({ role: z.enum(['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT']) });

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = paramsSchema.parse(await params);
    const { role } = roleSchema.parse(await request.json());

    const auth = await requireOrgRole(CAN_UPDATE_MEMBER_ROLE);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc('update_organization_member_role', {
      p_organization_id: auth.context.organizationId,
      p_target_user_id: userId,
      p_new_role: role,
    });

    if (error) {
      const mapped = mapRpcError(error, [
        { code: 'NOT_A_MEMBER', status: 403, message: 'You are not a member of this workspace' },
        { code: 'INSUFFICIENT_PERMISSIONS', status: 403, message: 'You do not have permission to change member roles' },
        { code: 'TARGET_NOT_A_MEMBER', status: 404, message: 'That person is not a member of this workspace' },
        { code: 'CANNOT_CHANGE_OWN_ROLE', status: 400, message: 'You cannot change your own role' },
        { code: 'CANNOT_MODIFY_OWNER', status: 403, message: 'Only the workspace owner can manage owners' },
        { code: 'CANNOT_ASSIGN_OWNER', status: 403, message: 'Only the workspace owner can assign the owner role' },
        { code: 'LAST_OWNER_PROTECTED', status: 409, message: 'A workspace must always have at least one owner' },
      ]);
      if (mapped) return mapped;
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    obs.error('Member role update failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not update the member role' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = paramsSchema.parse(await params);

    const auth = await requireOrgRole(CAN_REMOVE_MEMBER);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc('remove_organization_member', {
      p_organization_id: auth.context.organizationId,
      p_target_user_id: userId,
    });

    if (error) {
      const mapped = mapRpcError(error, [
        { code: 'NOT_A_MEMBER', status: 403, message: 'You are not a member of this workspace' },
        { code: 'INSUFFICIENT_PERMISSIONS', status: 403, message: 'You do not have permission to remove members' },
        { code: 'TARGET_NOT_A_MEMBER', status: 404, message: 'That person is not a member of this workspace' },
        { code: 'CANNOT_REMOVE_SELF', status: 400, message: 'You cannot remove yourself from the workspace' },
        { code: 'CANNOT_MODIFY_OWNER', status: 403, message: 'Only the workspace owner can manage owners' },
        { code: 'LAST_OWNER_PROTECTED', status: 409, message: 'A workspace must always have at least one owner' },
      ]);
      if (mapped) return mapped;
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid member id' }, { status: 400 });
    obs.error('Member remove failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not remove the member' }, { status: 500 });
  }
}