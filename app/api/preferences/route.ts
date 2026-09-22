import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';

const schema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const { data, error } = await supabase.from('user_profiles').select('theme_preference,timezone').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, theme: data?.theme_preference ?? 'light', timezone: data?.timezone ?? null });
  } catch (error) {
    obs.error('Preferences load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load preferences' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (!body.theme) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const { error } = await supabase.from('user_profiles').update({ theme_preference: body.theme, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true, theme: body.theme });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid theme preference' }, { status: 400 });
    obs.error('Preferences save failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not save preferences' }, { status: 500 });
  }
}
