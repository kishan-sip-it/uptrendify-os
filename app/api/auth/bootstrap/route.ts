import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';

const bootstrapSchema = z.object({
  organizationName: z.string().trim().min(2).max(120).optional(),
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
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      obs.error('Organization bootstrap auth lookup failed', { error: userError.message });
      return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 503 });
    }
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const parsedBody = bootstrapSchema.parse(await request.json().catch(() => ({})));

    // Existing users are resolved by their membership. They must never be
    // asked to type the organization name again.
    const { data: existingMembership, error: existingMembershipError } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingMembershipError) throw existingMembershipError;

    if (existingMembership) {
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id,name')
        .eq('id', existingMembership.organization_id)
        .maybeSingle();

      return NextResponse.json({
        organization: {
          id: existingMembership.organization_id,
          role: existingMembership.role,
          name: existingOrg?.name ?? null,
        },
      }, { status: 200 });
    }

    // First-time signup can bootstrap from the name supplied during
    // registration. Metadata is only used when no workspace exists yet.
    const userMetadataName = user.user_metadata?.organizationName;
    const organizationName =
      parsedBody.organizationName?.trim() ||
      (typeof userMetadataName === 'string' ? userMetadataName.trim() : '');

    if (!organizationName) {
      return NextResponse.json(
        { error: 'Your account is registered, but workspace setup is incomplete. Please restart registration and provide an organization name.' },
        { status: 409 },
      );
    }

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

    const bootstrapData = data as { id: string; role: string; name: string } | null;
    if (!bootstrapData) return NextResponse.json({ error: 'Could not create your workspace' }, { status: 500 });

    return NextResponse.json({
      organization: {
        id: bootstrapData.id,
        role: bootstrapData.role,
        name: bootstrapData.name,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid workspace setup request' }, { status: 400 });
    }
    obs.error('Organization bootstrap failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not create your workspace' }, { status: 500 });
  }
}
