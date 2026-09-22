import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';

const schema = z.object({ token: z.string().trim().min(32).max(128) });

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2,'0')).join('');
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in with the invited email before accepting this invitation.' }, { status: 401 });
    const hash = await hashToken(body.token);
    const { data, error } = await supabase.rpc('accept_team_invitation', { p_token_hash: hash });
    if (error) {
      const code = error.message.includes('INVITATION_EMAIL_MISMATCH') ? 403 : 400;
      return NextResponse.json({ error: error.message }, { status: code });
    }
    return NextResponse.json({ ok: true, invitation: data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid invitation token' }, { status: 400 });
    obs.error('Invitation acceptance failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not accept invitation' }, { status: 500 });
  }
}
