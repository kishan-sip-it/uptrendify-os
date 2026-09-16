import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_RUN_RESEARCH, requireOrgRole } from '@/lib/auth/roles';
import { researchBrand } from '@/lib/research/research-brand';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);

    const auth = await requireOrgRole(CAN_RUN_RESEARCH);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id,website_url')
      .eq('id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .single();
    if (brandError) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const idempotencyKey = `research:${brand.id}:${crypto.randomUUID()}`;
    const inserted = await supabase
      .from('research_runs')
      .insert({ organization_id: auth.context.organizationId, brand_id: brand.id, idempotency_key: idempotencyKey, status: 'QUEUED' })
      .select('id')
      .single();

    let runId: string;
    if (inserted.error) {
      const existing = await supabase.from('research_runs').select('id').eq('idempotency_key', idempotencyKey).maybeSingle();
      if (existing.error || !existing.data) throw inserted.error;
      runId = existing.data.id;
      obs.info('Research run deduplicated on retry', { researchRunId: runId, brandId: brand.id });
    } else {
      runId = inserted.data.id;
      obs.info('Research run queued', { researchRunId: runId, brandId: brand.id });
    }

    const result = await researchBrand(auth.context.organizationId, brand.id, brand.website_url, runId);

    return NextResponse.json({ ok: true, researchRunId: runId, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    obs.error('Research failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Research failed' }, { status: 500 });
  }
}