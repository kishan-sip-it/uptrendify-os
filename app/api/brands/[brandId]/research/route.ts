import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { researchBrand } from '@/lib/research/research-brand';

const paramsSchema = z.object({ brandId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data: membership } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'No organization membership found' }, { status: 403 });

    const { data: brand, error: brandError } = await supabase.from('brands').select('id,website_url').eq('id', brandId).eq('organization_id', membership.organization_id).single();
    if (brandError) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const idempotencyKey = `research:${brand.id}:${new Date().toISOString().slice(0, 13)}`;
    const run = await supabase.from('research_runs').insert({ organization_id: membership.organization_id, brand_id: brand.id, idempotency_key: idempotencyKey, status: 'QUEUED' }).select('id,status').single();
    if (run.error) throw run.error;

    const result = await researchBrand(membership.organization_id, brand.id, brand.website_url, run.data.id);
    return NextResponse.json({ ok: true, researchRunId: run.data.id, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Research failed' }, { status: 500 });
  }
}
