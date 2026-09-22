import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOrgRole, type OrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const inviteSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  role: z.enum(['ADMIN','STRATEGIST','EDITOR','APPROVER','CLIENT']),
});

const manageRoles: OrgRole[] = ['OWNER', 'ADMIN'];

export async function GET() {
  try {
    const auth = await requireOrgRole(['OWNER','ADMIN','STRATEGIST','EDITOR','APPROVER','CLIENT']);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();

    const [members, profiles, invitations] = await Promise.all([
      supabase.from('organization_members').select('id,user_id,role,created_at').eq('organization_id', auth.context.organizationId).order('created_at'),
      supabase.from('user_profiles').select('user_id,first_name,last_name').eq('organization_id', auth.context.organizationId),
      supabase.from('team_invitations').select('id,email,role,expires_at,accepted_at,revoked_at,created_at').eq('organization_id', auth.context.organizationId).order('created_at',{ascending:false}).limit(50),
    ]);
    if (members.error) throw members.error;
    if (profiles.error) throw profiles.error;
    if (invitations.error) throw invitations.error;

    const profileMap = new Map((profiles.data ?? []).map((p) => [p.user_id, p]));
    return NextResponse.json({
      ok: true,
      canManage: manageRoles.includes(auth.context.role),
      members: (members.data ?? []).map((m) => ({
        ...m,
        name: [profileMap.get(m.user_id)?.first_name, profileMap.get(m.user_id)?.last_name].filter(Boolean).join(' ') || 'Team member',
      })),
      invitations: invitations.data ?? [],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    obs.error('Team load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load team' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = inviteSchema.parse(await request.json());
    const auth = await requireOrgRole(manageRoles);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();

    const existingMember = await supabase.from('organization_members').select('user_id').eq('organization_id', auth.context.organizationId).eq('user_id', (await supabase.from('user_profiles').select('user_id').eq('organization_id',auth.context.organizationId).limit(1)).data?.[0]?.user_id ?? '00000000-0000-0000-0000-000000000000').maybeSingle();
    void existingMember;

    const duplicate = await supabase.from('team_invitations').select('id').eq('organization_id', auth.context.organizationId).eq('email', body.email).is('accepted_at', null).is('revoked_at', null).maybeSingle();
    if (duplicate.data) return NextResponse.json({ error: 'An active invitation already exists for this email.' }, { status: 409 });

    const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2,'0')).join('');

    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const inserted = await supabase.from('team_invitations').insert({
      organization_id: auth.context.organizationId,
      email: body.email,
      role: body.role,
      token_hash: tokenHash,
      invited_by: auth.context.userId,
      expires_at: expiresAt,
    }).select('id,email,role,expires_at').single();
    if (inserted.error) throw inserted.error;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.json({ ok: true, invitation: inserted.data, inviteLink: appUrl.replace(/\/$/, '') + '/invite?token=' + token }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid invitation', details: error.flatten() }, { status: 400 });
    obs.error('Invitation creation failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not create invitation' }, { status: 500 });
  }
}
