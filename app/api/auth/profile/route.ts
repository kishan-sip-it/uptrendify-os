import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
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

    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (membershipError) throw membershipError;
    const organizationId = membership?.organization_id ?? null;

    const upsert = await supabase.from('user_profiles').upsert({
      user_id: user.id,
      organization_id: organizationId,
      first_name: parsed.firstName ?? null,
      last_name: parsed.lastName ?? null,
      role: parsed.role ?? null,
      team_size: parsed.teamSize ?? null,
      timezone: parsed.timezone ?? null,
      onboarding_completed: parsed.onboardingComplete ?? false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (upsert.error) throw upsert.error;

    if (parsed.role && membership && membership.role !== parsed.role) {
      const admin = createSupabaseAdminClient();
      const { error: roleError } = await admin
        .from('organization_members')
        .update({ role: parsed.role })
        .eq('user_id', user.id)
        .eq('organization_id', membership.organization_id);
      if (roleError) throw roleError;
    }

    return NextResponse.json({ ok: true, profile: { ...parsed, organization_id: organizationId } }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid profile' }, { status: 400 });
    obs.error('Profile save failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not save your profile' }, { status: 500 });
  }
}