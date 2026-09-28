import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOrgRole, CAN_VIEW_DASHBOARD, type OrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';
import { completedStepsWith } from '@/lib/onboarding/state';

const stepSchema = z.object({
  step: z.number().int().min(0).max(5),
  completed: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  complete: z.boolean().optional(),
});

export async function GET() {
  try {
    const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();

    const [progress, organization, profile] = await Promise.all([
      supabase.from('onboarding_progress').select('current_step,completed_steps,draft_data,completed_at').eq('user_id', auth.context.userId).maybeSingle(),
      supabase.from('organizations').select('id,name,workspace_type,timezone').eq('id', auth.context.organizationId).maybeSingle(),
      supabase.from('user_profiles').select('first_name,last_name,team_size,timezone,onboarding_completed,theme_preference').eq('user_id', auth.context.userId).maybeSingle(),
    ]);
    if (progress.error) throw progress.error;
    if (organization.error) throw organization.error;
    if (profile.error) throw profile.error;

    return NextResponse.json({
      ok: true,
      progress: progress.data,
      organization: organization.data,
      profile: profile.data,
      role: auth.context.role,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    obs.error('Onboarding state load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load onboarding' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = stepSchema.parse(await request.json());
    const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();

    const existing = await supabase
      .from('onboarding_progress')
      .select('completed_steps,draft_data')
      .eq('user_id', auth.context.userId)
      .maybeSingle();
    if (existing.error) throw existing.error;

    const previousData = (existing.data?.draft_data ?? {}) as Record<string, unknown>;
    const nextData = { ...previousData, ...(body.data ?? {}) };
    const previousCompleted = Array.isArray(existing.data?.completed_steps) ? existing.data!.completed_steps : [];
    const nextCompleted = body.completed ? completedStepsWith(previousCompleted, body.step) : previousCompleted;

    const row = {
      user_id: auth.context.userId,
      organization_id: auth.context.organizationId,
      current_step: body.step,
      completed_steps: nextCompleted,
      draft_data: nextData,
      updated_at: new Date().toISOString(),
      completed_at: body.complete ? new Date().toISOString() : null,
    };

    // Use explicit update/insert instead of a blind upsert. This keeps the
    // onboarding write path deterministic when an autosave and a manual
    // "Save & continue" happen close together.
    const existingProgress = await supabase
      .from('onboarding_progress')
      .select('user_id')
      .eq('user_id', auth.context.userId)
      .maybeSingle();
    if (existingProgress.error) throw existingProgress.error;

    let saved = existingProgress.data
      ? await supabase
          .from('onboarding_progress')
          .update(row)
          .eq('user_id', auth.context.userId)
          .select('current_step,completed_steps,draft_data,completed_at')
          .single()
      : await supabase
          .from('onboarding_progress')
          .insert(row)
          .select('current_step,completed_steps,draft_data,completed_at')
          .single();

    // A concurrent first write can win the insert between the existence check
    // and INSERT. Retry that rare conflict as an UPDATE.
    if (saved.error?.code === '23505') {
      saved = await supabase
        .from('onboarding_progress')
        .update(row)
        .eq('user_id', auth.context.userId)
        .select('current_step,completed_steps,draft_data,completed_at')
        .single();
    }
    if (saved.error) throw saved.error;

    if (body.complete) {
      const profile = await supabase
        .from('user_profiles')
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq('user_id', auth.context.userId)
        .select('onboarding_completed')
        .single();
      if (profile.error) throw profile.error;
    }

    return NextResponse.json({ ok: true, progress: saved.data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid onboarding data', details: error.flatten() }, { status: 400 });
    obs.error('Onboarding state save failed', {
      error: error instanceof Error ? error.message : String(error),
      code: typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : undefined,
    });
    return NextResponse.json(
      { error: 'We could not save your onboarding progress. Your account is still safe — please try Save & continue again.' },
      { status: 500 },
    );
  }
}
