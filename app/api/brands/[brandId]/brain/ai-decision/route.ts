import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_REVIEW_SUGGESTIONS, requireOrgRole } from '@/lib/auth/roles';
import { decideBrandBrainSuggestions } from '@/lib/brain/ai-decision';
import { FIELD_BY_KEY } from '@/lib/brain/suggestions';
import { obs } from '@/lib/obs/logger';

const paramsSchema = z.object({ brandId: z.string().uuid() });

export async function POST(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);
    const auth = await requireOrgRole(CAN_REVIEW_SUGGESTIONS);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const { data: brand } = await supabase
      .from('brands')
      .select('id')
      .eq('id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .maybeSingle();
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const { data: rows, error } = await supabase
      .from('brand_suggestions')
      .select('id,field,label,kind,proposed_value,status,evidence,evidence_strength,sources_examined,confidence')
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .eq('status', 'PENDING')
      .order('field', { ascending: true });
    if (error) throw error;

    const result = await decideBrandBrainSuggestions((rows ?? []).map((row: any) => ({
      id: row.id,
      field: row.field,
      label: row.label,
      section: FIELD_BY_KEY.get(row.field)?.section ?? '',
      proposed_value: row.proposed_value,
      status: row.status,
      evidence: Array.isArray(row.evidence) ? row.evidence : [],
      evidence_strength: row.evidence_strength,
      sources_examined: row.sources_examined ?? 0,
      confidence: row.confidence,
    })));

    return NextResponse.json({ ok: true, ...result, generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    obs.error('Brand Brain AI decision failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not generate AI decisions' }, { status: 502 });
  }
}
