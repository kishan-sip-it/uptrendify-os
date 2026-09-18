import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';

const bootstrapSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
});

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data: membership, error } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      obs.error('Failed to load organization membership', { error: error.message });
      return NextResponse.json({ error: 'Failed to load your workspace' }, { status: 500 });
    }

    if (!membership) return NextResponse.json({ organization: null });

    const { data: org } = await supabase
      .from('organizations')
      .select('id,name')
      .eq('id', membership.organization_id)
      .maybeSingle();

    return NextResponse.json({
      organization: {
        id: membership.organization_id,
        role: membership.role,
        name: org?.name ?? null,
      },
    });
  } catch (error) {
    obs.error('Organization lookup failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load your workspace' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { organizationName } = bootstrapSchema.parse(await request.json());

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      obs.error('Organization bootstrap auth lookup failed', { error: userError.message });
      return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 503 });
    }
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data, error } = await supabase
      .rpc('bootstrap_organization', { organization_name: organizationName })
      .maybeSingle();

    if (error) {
      obs.error('Organization bootstrap RPC failed', { error: error.message });
      if (error.message.includes('AUTHENTICATION_REQUIRED')) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Could not create your workspace' }, { status: 500 });
    }

    if (!data) return NextResponse.json({ error: 'Could not create your workspace' }, { status: 500 });

    return NextResponse.json({
      organization: {
        id: data.id,
        role: data.role,
        name: data.name,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }
    obs.error('Organization bootstrap failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not create your workspace' }, { status: 500 });
  }
}
