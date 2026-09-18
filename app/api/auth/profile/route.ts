import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ROLES, type OrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const roleValues = Object.values(ROLES) as OrgRole[];

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().max(120).optional().nullable(),
  role: z.enum(roleValues as [OrgRole, ...OrgRole[]]).optional(),
  teamSize: z.string().trim().max(40).optional().nullable(),
  timezone: z.string().trim().max(80).optional().nullable(),
  onboardingComplete: z.boolean().optional(),
});

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('first_name,last_name,role,team_size,timezone,onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    obs.error('Profile load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load your profile' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = profileSchema.parse(await request.json());

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const [{ data: membership, error: membershipError }, { data: existingProfile, error: profileError }] = await Promise.all([
      supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_profiles')
        .select('first_name,last_name,role,team_size,timezone,onboarding_completed,organization_id')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    if (membershipError) throw membershipError;
    if (profileError) throw profileError;

    const organizationId = membership?.organization_id ?? existingProfile?.organization_id ?? null;
    const profileRow = {
      user_id: user.id,
      organization_id: organizationId,
      first_name: parsed.firstName !== undefined ? parsed.firstName : existingProfile?.first_name ?? null,
      last_name: parsed.lastName !== undefined ? parsed.lastName : existingProfile?.last_name ?? null,
      // Membership role is authoritative. Do not persist a client-supplied role.
      role: membership?.role ?? existingProfile?.role ?? null,
      team_size: parsed.teamSize !== undefined ? parsed.teamSize : existingProfile?.team_size ?? null,
      timezone: parsed.timezone !== undefined ? parsed.timezone : existingProfile?.timezone ?? null,
      onboarding_completed:
        parsed.onboardingComplete !== undefined
          ? parsed.onboardingComplete
          : existingProfile?.onboarding_completed ?? false,
      updated_at: new Date().toISOString(),
    };

    const upsert = await supabase.from('user_profiles').upsert(profileRow, { onConflict: 'user_id' });
    if (upsert.error) throw upsert.error;

    if (membership?.role && parsed.role && parsed.role !== membership.role) {
      obs.info('Ignoring self-service membership role change attempt', {
        userId: user.id,
        requestedRole: parsed.role,
        effectiveRole: membership.role,
      });
    }

    return NextResponse.json({
      ok: true,
      profile: {
        firstName: profileRow.first_name,
        lastName: profileRow.last_name,
        role: profileRow.role,
        teamSize: profileRow.team_size,
        timezone: profileRow.timezone,
        onboardingComplete: profileRow.onboarding_completed,
        organization_id: profileRow.organization_id,
      },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid profile' }, { status: 400 });
    obs.error('Profile save failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not save your profile' }, { status: 500 });
  }
}
