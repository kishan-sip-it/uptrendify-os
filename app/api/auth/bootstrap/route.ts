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
      .select('id,name,workspace_type,timezone')
      .eq('id', membership.organization_id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      organization: {
        id: membership.organization_id,
        role: membership.role,
        name: org?.name ?? null,
        workspaceType: org?.workspace_type ?? 'AGENCY',
        timezone: org?.timezone ?? null,
        onboardingCompleted: Boolean(profile?.onboarding_completed),
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
    const authorization = request.headers.get('authorization');
    const accessToken = authorization?.match(/^Bearer\\s+(.+)$/i)?.[1]?.trim() || null;

    const { data: { user }, error: userError } = accessToken
      ? await supabase.auth.getUser(accessToken)
      : await supabase.auth.getUser();

    if (userError) {
      const errorName = String(userError.name || '').toLowerCase();
      const errorMessage = String(userError.message || '').toLowerCase();
      const isUnauthenticated =
        errorName.includes('authsessionmissing') ||
        errorMessage.includes('auth session missing') ||
        Number((userError as { status?: number }).status) === 401;

      if (isUnauthenticated) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      obs.error('Organization bootstrap auth lookup failed', {
        error: userError.message,
        name: userError.name,
        status: (userError as { status?: number }).status ?? null,
      });
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
        .select('id,name,workspace_type,timezone')
        .eq('id', existingMembership.organization_id)
        .maybeSingle();

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle();

      return NextResponse.json({
        organization: {
          id: existingMembership.organization_id,
          role: existingMembership.role,
          name: existingOrg?.name ?? null,
          workspaceType: existingOrg?.workspace_type ?? 'AGENCY',
          timezone: existingOrg?.timezone ?? null,
          onboardingCompleted: Boolean(profile?.onboarding_completed),
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

    const { data, error } = await supabase.rpc('bootstrap_organization', {
      organization_name: organizationName,
    });

    if (error) {
      obs.error('Organization bootstrap RPC failed', { error: error.message });
      if (error.message.includes('AUTHENTICATION_REQUIRED')) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Could not create your workspace' }, { status: 500 });
    }

    const rawData = Array.isArray(data) ? data[0] : data;
    const bootstrapData = rawData as { id: string; role: string; name: string } | null | undefined;
    if (!bootstrapData?.id) return NextResponse.json({ error: 'Could not create your workspace' }, { status: 500 });

    return NextResponse.json({
      organization: {
        id: bootstrapData.id,
        role: bootstrapData.role,
        name: bootstrapData.name,
        workspaceType: 'AGENCY',
        timezone: null,
        onboardingCompleted: false,
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
