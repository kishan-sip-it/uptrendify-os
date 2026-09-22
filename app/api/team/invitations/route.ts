import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CAN_INVITE_MEMBERS, CAN_MANAGE_MEMBERS, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';
import { mapRpcError } from '@/lib/team/rpc-error';

const inviteSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(['ADMIN', 'STRATEGIST', 'EDITOR', 'APPROVER', 'CLIENT']),
});

export async function GET() {
  try {
    const auth = await requireOrgRole(CAN_MANAGE_MEMBERS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('organization_invitations')
      .select('id, invited_email, role, invited_by, expires_at, accepted_at, revoked_at, created_at')
      .eq('organization_id', auth.context.organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ invitations: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    obs.error('Invitation list failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load invitations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireOrgRole(CAN_INVITE_MEMBERS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const body = inviteSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.rpc('invite_organization_member', {
      p_organization_id: auth.context.organizationId,
      p_email: body.email,
      p_role: body.role,
    });

    if (error) {
      const mapped = mapRpcError(error, [
        { code: 'AUTHENTICATION_REQUIRED', status: 401, message: 'Authentication required' },
        { code: 'NOT_A_MEMBER', status: 403, message: 'You are not a member of this workspace' },
        { code: 'INSUFFICIENT_PERMISSIONS', status: 403, message: 'You do not have permission to invite members' },
        { code: 'INVALID_EMAIL', status: 400, message: 'Please provide a valid email address' },
        { code: 'CANNOT_INVITE_OWNER', status: 400, message: 'Owners must be assigned from existing members' },
        { code: 'ALREADY_A_MEMBER', status: 409, message: 'That person is already a member of this workspace' },
        { code: 'PENDING_INVITE_EXISTS', status: 409, message: 'That email already has a pending invitation' },
      ]);
      if (mapped) return mapped;
      throw error;
    }

    const invite = Array.isArray(data) ? data[0] : data;
    if (!invite?.id) return NextResponse.json({ error: 'Could not create the invitation' }, { status: 500 });

    return NextResponse.json({ ok: true, invitation: invite }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Provide a valid email and role' }, { status: 400 });
    obs.error('Invitation create failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not create the invitation' }, { status: 500 });
  }
}