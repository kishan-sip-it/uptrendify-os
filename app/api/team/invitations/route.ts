import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const schema = z.object({ id: z.string().uuid() });

export async function DELETE(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const auth = await requireOrgRole(['OWNER','ADMIN']);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from('team_invitations').update({ revoked_at: new Date().toISOString() }).eq('id', body.id).eq('organization_id', auth.context.organizationId).is('accepted_at', null).select('id,revoked_at').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    return NextResponse.json({ ok: true, invitation: data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid invitation' }, { status: 400 });
    obs.error('Invitation revoke failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not revoke invitation' }, { status: 500 });
  }
}
