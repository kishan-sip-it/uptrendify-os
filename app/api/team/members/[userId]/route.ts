import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const roleSchema = z.object({ role: z.enum(['OWNER','ADMIN','STRATEGIST','EDITOR','APPROVER','CLIENT']) });

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const body = roleSchema.parse(await request.json());
    const { userId } = await params;
    const auth = await requireOrgRole(['OWNER','ADMIN']);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();
    const target = await supabase.from('organization_members').select('id,user_id,role').eq('organization_id', auth.context.organizationId).eq('user_id', userId).maybeSingle();
    if (target.error) throw target.error;
    if (!target.data) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (auth.context.role === 'ADMIN' && target.data.role === 'OWNER') return NextResponse.json({ error: 'Only an Owner can change another Owner.' }, { status: 403 });
    const result = await supabase.from('organization_members').update({ role: body.role }).eq('id', target.data.id).eq('organization_id', auth.context.organizationId).select('id,user_id,role').single();
    if (result.error) throw result.error;
    await supabase.from('user_profiles').update({ role: body.role, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('organization_id', auth.context.organizationId);
    return NextResponse.json({ ok: true, member: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    obs.error('Team role update failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not change member role' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const auth = await requireOrgRole(['OWNER','ADMIN']);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    if (userId === auth.context.userId) return NextResponse.json({ error: 'Leave/reassign ownership before removing yourself.' }, { status: 400 });
    const supabase = await createSupabaseServerClient();
    const target = await supabase.from('organization_members').select('id,role').eq('organization_id', auth.context.organizationId).eq('user_id', userId).maybeSingle();
    if (target.error) throw target.error;
    if (!target.data) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (auth.context.role === 'ADMIN' && target.data.role === 'OWNER') return NextResponse.json({ error: 'Only an Owner can remove another Owner.' }, { status: 403 });
    const removed = await supabase.from('organization_members').delete().eq('id', target.data.id).eq('organization_id', auth.context.organizationId);
    if (removed.error) throw removed.error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    obs.error('Team member removal failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not remove member' }, { status: 500 });
  }
}
