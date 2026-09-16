import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ROLES } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const bootstrapSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
});

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'organization';
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    obs.error('Failed to load organization membership', { error: error.message });
    return NextResponse.json({ error: 'Failed to load your workspace' }, { status: 500 });
  }

  if (!membership) return NextResponse.json({ organization: null });

  const { data: org } = await supabase.from('organizations').select('name').eq('id', membership.organization_id).maybeSingle();

  return NextResponse.json({
    organization: {
      id: membership.organization_id,
      role: membership.role,
      name: org?.name ?? null,
    },
  });
}

export async function POST(request: Request) {
  try {
    const { organizationName } = bootstrapSchema.parse(await request.json());

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const existing = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      return NextResponse.json({ organization: { id: existing.data.organization_id, role: ROLES.OWNER } }, { status: 200 });
    }

    const admin = createSupabaseAdminClient();
    const slug = `${slugify(organizationName)}-${crypto.randomUUID().slice(0, 6)}`;

    const created = await admin.from('organizations').insert({ name: organizationName, slug }).select('id').single();
    if (created.error) throw created.error;

    const membership = await admin.from('organization_members').insert({
      organization_id: created.data.id,
      user_id: user.id,
      role: ROLES.OWNER,
    }).select('organization_id, role').single();
    if (membership.error) throw membership.error;

    obs.info('Organization bootstrapped', { organizationId: created.data.id, actorUserId: user.id });

    return NextResponse.json({ organization: { id: membership.data.organization_id, role: membership.data.role, name: organizationName } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    obs.error('Organization bootstrap failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not create your workspace' }, { status: 500 });
  }
}