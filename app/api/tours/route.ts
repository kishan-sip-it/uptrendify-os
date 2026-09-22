import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { obs } from '@/lib/obs/logger';

const schema = z.object({
  stageKey: z.string().trim().min(1).max(80),
  tourVersion: z.number().int().min(1).max(100).default(1),
  status: z.enum(['COMPLETED', 'SKIPPED']),
});

export async function GET(request: Request) {
  try {
    const stageKey = new URL(request.url).searchParams.get('stageKey');
    if (!stageKey) return NextResponse.json({ error: 'stageKey is required' }, { status: 400 });
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const { data, error } = await supabase.from('user_tour_state').select('stage_key,tour_version,status,updated_at').eq('user_id', user.id).eq('stage_key', stageKey).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, state: data });
  } catch (error) {
    obs.error('Tour state load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load guide state' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const { error } = await supabase.from('user_tour_state').upsert({
      user_id: user.id,
      stage_key: body.stageKey,
      tour_version: body.tourVersion,
      status: body.status,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,stage_key' });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid guide state' }, { status: 400 });
    obs.error('Tour state save failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not save guide state' }, { status: 500 });
  }
}
