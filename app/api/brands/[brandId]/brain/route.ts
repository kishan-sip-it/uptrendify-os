import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_VIEW_BRAND, requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';
import { computeCounts } from '@/lib/brain/review';
import { FIELD_BY_KEY } from '@/lib/brain/suggestions';

const paramsSchema = z.object({ brandId: z.string().uuid() });

export type BrainSuggestion = {
  id: string;
  field: string;
  label: string;
  section: string;
  kind: string;
  proposed_value: unknown;
  status: string;
  evidence: unknown[];
  evidence_strength: string | null;
  sources_examined: number;
  confidence: number | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = paramsSchema.parse(await params);

    const auth = await requireOrgRole(CAN_VIEW_BRAND);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();

    const { data: brand } = await supabase
      .from('brands')
      .select('id')
      .eq('id', brandId)
      .eq('organization_id', auth.context.organizationId)
      .maybeSingle();
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const [factsResult, insightsResult, sourcesResult, runsResult, suggestionsResult] = await Promise.all([
      supabase
        .from('brand_facts')
        .select('id,key,value,source_type,confidence,evidence_source_ids,approved,updated_at')
        .eq('brand_id', brandId)
        .eq('organization_id', auth.context.organizationId)
        .order('key', { ascending: true }),
      supabase
        .from('brand_insights')
        .select('id,category,title,description,priority,evidence_source_ids,metadata,created_at')
        .eq('brand_id', brandId)
        .eq('organization_id', auth.context.organizationId)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('brand_sources')
        .select('id,url,canonical_url,title,http_status,retrieved_at')
        .eq('brand_id', brandId)
        .eq('organization_id', auth.context.organizationId)
        .order('retrieved_at', { ascending: false })
        .limit(50),
      supabase
        .from('research_runs')
        .select('id,status,pages_processed,pages_discovered,error_code,error_message,created_at,started_at,finished_at,ai_tasks(research_run_id,status,provider,model,error_message,created_at)')
        .eq('brand_id', brandId)
        .eq('organization_id', auth.context.organizationId)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('brand_suggestions')
        .select('id,field,label,kind,proposed_value,status,evidence,evidence_strength,sources_examined,confidence,created_at,updated_at,reviewed_at')
        .eq('brand_id', brandId)
        .eq('organization_id', auth.context.organizationId)
        .order('field', { ascending: true }),
    ]);

    for (const result of [factsResult, insightsResult, sourcesResult, runsResult, suggestionsResult]) {
      if (result.error) throw result.error;
    }

    const latestRun = runsResult.data?.[0] ?? null;
    const ai = latestRun && Array.isArray(latestRun.ai_tasks) && latestRun.ai_tasks.length > 0
      ? [...latestRun.ai_tasks].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      : null;

    const runSourceCounts = await (async () => {
      if (!latestRun) return { processed: 0, failed: 0, pagesDiscovered: 0, pagesProcessed: 0 };
      const { data, error } = await supabase
        .from('research_sources')
        .select('status')
        .eq('organization_id', auth.context.organizationId)
        .eq('research_run_id', latestRun.id);
      if (error) return { processed: 0, failed: 0, pagesDiscovered: latestRun.pages_discovered, pagesProcessed: latestRun.pages_processed };
      const processed = (data ?? []).filter((row) => row.status !== 'FAILED').length;
      const failed = (data ?? []).filter((row) => row.status === 'FAILED').length;
      return { processed, failed, pagesDiscovered: latestRun.pages_discovered, pagesProcessed: latestRun.pages_processed };
    })();

    const suggestions: BrainSuggestion[] = (suggestionsResult.data ?? []).map((row: any) => {
      const fieldDef = FIELD_BY_KEY.get(row.field);
      return {
        id: row.id,
        field: row.field,
        label: row.label,
        section: fieldDef?.section ?? '',
        kind: row.kind,
        proposed_value: row.proposed_value,
        status: row.status,
        evidence: row.evidence,
        evidence_strength: row.evidence_strength,
        sources_examined: row.sources_examined,
        confidence: row.confidence,
        created_at: row.created_at,
        updated_at: row.updated_at,
        reviewed_at: row.reviewed_at,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        facts: (factsResult.data ?? []).filter((fact: any) => fact.approved),
        insights: insightsResult.data ?? [],
        sources: sourcesResult.data ?? [],
        latestRun: latestRun
          ? {
              id: latestRun.id,
              status: latestRun.status,
              pagesProcessed: latestRun.pages_processed,
              pagesDiscovered: latestRun.pages_discovered,
              errorCode: latestRun.error_code,
              errorMessage: latestRun.error_message,
              createdAt: latestRun.created_at,
              finishedAt: latestRun.finished_at,
              ai: ai ? { status: ai.status, provider: ai.provider, model: ai.model, errorMessage: ai.error_message } : null,
            }
          : null,
        suggestions,
        suggestionCounts: computeCounts(suggestions as any),
        importInfo: runSourceCounts,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
    obs.error('Brand brain load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load brand brain' }, { status: 500 });
  }
}