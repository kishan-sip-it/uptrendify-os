import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ORG_SWITCH_COOKIE } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';
import { mapRpcError } from '@/lib/team/rpc-error';

const tokenSchema = z.object({ token: z.string().min(32).max(128) });

function invitationStatus(invitation: {
  accepted_at?: string | null;
  revoked_at?: string | null;
  expires_at?: string | null;
}): string {
  if (invitation.accepted_at) return 'ACCEPTED';
  if (invitation.revoked_at) return 'REVOKED';
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) return 'EXPIRED';
  return 'PENDING';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { token } = tokenSchema.parse({ token: searchParams.get('token') ?? '' });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('preview_organization_invitation', { p_token: token });

    if (error) throw error;
    const invitation = Array.isArray(data) ? data[0] : data;
    if (!invitation?.invited_email) return NextResponse.json({ error: 'Invitation not found', code: 'INVITATION_NOT_FOUND' }, { status: 404 });

    return NextResponse.json({
      invitation: {
        invitedEmail: invitation.invited_email,
        role: invitation.role,
        organizationName: invitation.organization_name,
        status: invitationStatus(invitation),
        acceptedAt: invitation.accepted_at ?? null,
        revokedAt: invitation.revoked_at ?? null,
        expiresAt: invitation.expires_at ?? null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid invitation link', code: 'INVALID_TOKEN' }, { status: 400 });
    obs.error('Invitation preview failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load the invitation' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { token } = tokenSchema.parse(await request.json());

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data, error } = await supabase.rpc('accept_organization_invitation', { p_token: token });

    if (error) {
      const mapped = mapRpcError(error, [
        { code: 'AUTHENTICATION_REQUIRED', status: 401, message: 'Authentication required' },
        { code: 'INVITATION_NOT_FOUND', status: 404, message: 'Invitation not found' },
        { code: 'INVITATION_REVOKED', status: 410, message: 'This invitation has been revoked' },
        { code: 'INVITATION_ALREADY_ACCEPTED', status: 410, message: 'This invitation has already been accepted' },
        { code: 'INVITATION_EXPIRED', status: 410, message: 'This invitation has expired' },
        { code: 'INVITATION_EMAIL_MISMATCH', status: 403, message: 'This invitation was sent to a different email address' },
        { code: 'ALREADY_A_MEMBER', status: 409, message: 'You are already a member of this workspace' },
      ]);
      if (mapped) return mapped;
      throw error;
    }

    const accepted = Array.isArray(data) ? data[0] : data;
    if (!accepted?.organization_id) return NextResponse.json({ error: 'Could not accept the invitation' }, { status: 500 });

    const response = NextResponse.json(
      {
        ok: true,
        organization: { id: accepted.organization_id, role: accepted.role, name: accepted.organization_name ?? null },
      },
      { status: 200 },
    );
    response.cookies.set(ORG_SWITCH_COOKIE, accepted.organization_id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 90,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid invitation link', code: 'INVALID_TOKEN' }, { status: 400 });
    obs.error('Invitation accept failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not accept the invitation' }, { status: 500 });
  }
}