import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ORG_SWITCH_COOKIE } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const switchSchema = z.object({ organizationId: z.string().uuid() });

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data: memberships, error } = await supabase
      .from('organization_members')
      .select('organization_id, role, organization:organizations(id,name,slug)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const organizations = (memberships ?? []).map((membership) => ({
      id: membership.organization_id,
      role: membership.role,
      name: (membership.organization as { name?: string | null } | null)?.name ?? 'Workspace',
      slug: (membership.organization as { slug?: string | null } | null)?.slug ?? null,
    }));

    return NextResponse.json({ ok: true, organizations });
  } catch (error) {
    obs.error('Organization list failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load your workspaces' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = switchSchema.parse(await request.json());

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data: membership, error } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!membership) return NextResponse.json({ error: 'You are not a member of that workspace' }, { status: 403 });

    const response = NextResponse.json({ ok: true, organizationId });
    response.cookies.set(ORG_SWITCH_COOKIE, organizationId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 90,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid workspace id' }, { status: 400 });
    obs.error('Organization switch failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not switch workspace' }, { status: 500 });
  }
}