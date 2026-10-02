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
    const { data: brand } = await supabase.from('brands').select('id').eq('id', brandId).eq('organization_id', auth.context.organizationId).maybeSingle();
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const { data: rows, error } = await supabase
      .from('brand_suggestions')
      .select('id,field,label,kind,proposed_value,status,evidence,evidence_strength,sources_examined,confidence')
      .eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .eq('status', 'PENDING')
      .is('ai_decision', null)
      .order('field', { ascending: true });
    if (error) throw error;

    if ((rows ?? []).length === 0) {
      return NextResponse.json({ ok: true, decisions: [], provider: 'none', model: 'none', generatedAt: new Date().toISOString(), message: 'All pending suggestions already have an AI recommendation or are intentionally held for human review.' }, { headers: { 'Cache-Control': 'no-store' } });
    }

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

    const now = new Date().toISOString();
    for (const decision of result.decisions) {
      const { error: updateError } = await supabase.from('brand_suggestions').update({
        ai_decision: decision.decision,
        ai_confidence: decision.confidence,
        ai_reason: decision.reason,
        ai_decided_at: now,
        updated_at: now,
      }).eq('id', decision.suggestionId).eq('brand_id', brandId).eq('organization_id', auth.context.organizationId).eq('status', 'PENDING').is('ai_decision', null);
      if (updateError) throw updateError;
    }

    return NextResponse.json({ ok: true, ...result, generatedAt: now }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    obs.error('Brand Brain AI decision failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not generate AI decisions' }, { status: 502 });
  }
}
