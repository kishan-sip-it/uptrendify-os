import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CAN_MANAGE_MEMBERS, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';
import { mapRpcError } from '@/lib/team/rpc-error';

const paramsSchema = z.object({ invitationId: z.string().uuid() });
const revokeSchema = z.object({ action: z.literal('revoke') });

export async function GET(_request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  try {
    const { invitationId } = paramsSchema.parse(await params);

    const auth = await requireOrgRole(CAN_MANAGE_MEMBERS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('get_invitation_token', {
      p_invitation_id: invitationId,
      p_organization_id: auth.context.organizationId,
    });

    if (error) {
      const mapped = mapRpcError(error, [
        { code: 'NOT_A_MEMBER', status: 403, message: 'You are not a member of this workspace' },
        { code: 'INSUFFICIENT_PERMISSIONS', status: 403, message: 'You do not have permission to manage invitations' },
        { code: 'INVITATION_NOT_FOUND', status: 404, message: 'Invitation not found' },
      ]);
      if (mapped) return mapped;
      throw error;
    }

    const token = Array.isArray(data) ? data[0] : data;
    if (typeof token !== 'string' || !token) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

    return NextResponse.json({ ok: true, token });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid invitation id' }, { status: 400 });
    obs.error('Invitation token lookup failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load the invitation link' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  try {
    const { invitationId } = paramsSchema.parse(await params);
    revokeSchema.parse(await request.json().catch(() => ({})));

    const auth = await requireOrgRole(CAN_MANAGE_MEMBERS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc('revoke_organization_invitation', {
      p_invitation_id: invitationId,
      p_organization_id: auth.context.organizationId,
    });

    if (error) {
      const mapped = mapRpcError(error, [
        { code: 'INVITATION_ALREADY_ACCEPTED', status: 409, message: 'That invitation has already been accepted' },
        { code: 'INVITATION_NOT_FOUND', status: 404, message: 'Invitation not found' },
      ]);
      if (mapped) return mapped;
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    obs.error('Invitation revoke failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not revoke the invitation' }, { status: 500 });
  }
}