import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiProvider } from '@/lib/ai/types';
import type { EvidenceFragment } from '@/lib/ai/brand-intelligence';
import { createDefaultRegistry } from '@/lib/ai/registry';
import { extractWithRetry, loadBrandEvidence, type EvidenceBundle } from '@/lib/research/brain';
import { FIELD_BY_KEY, fieldSummary, type EvidenceItem, type SuggestionRow, type SuggestionStatus, type SuggestionDraft, deriveSuggestionDraft } from '@/lib/brain/suggestions';
import { obs } from '@/lib/obs/logger';

export type { SuggestionRow } from '@/lib/brain/suggestions';

export const INSUFFICIENT_APPROVED_BRAIN = 'INSUFFICIENT_APPROVED_BRAIN' as const;
export const GATE_MIN_APPROVED = 4;
export const GATE_REQUIRED_FIELDS = ['brand_name'] as const;

export type SuggestionCounts = {
  pending: number;
  approved: number;
  rejected: number;
  edited: number;
  notFound: number;
  total: number;
  needsReview: number;
};

export function computeCounts(rows: SuggestionRow[]): SuggestionCounts {
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let edited = 0;
  let notFound = 0;
  for (const row of rows) {
    if (row.status === 'PENDING') pending += 1;
    else if (row.status === 'APPROVED') approved += 1;
    else if (row.status === 'REJECTED') rejected += 1;
    else if (row.status === 'EDITED') edited += 1;
    else if (row.status === 'NOT_FOUND') notFound += 1;
  }
  return { pending, approved, rejected, edited, notFound, total: rows.length, needsReview: pending };
}

export async function loadSuggestionRows(supabase: SupabaseClient, args: { organizationId: string; brandId: string }): Promise<SuggestionRow[]> {
  const { data, error } = await supabase
    .from('brand_suggestions')
    .select('id,field,label,kind,proposed_value,status,evidence,evidence_strength,sources_examined,confidence,history,created_at,updated_at,reviewed_at')
    .eq('brand_id', args.brandId)
    .eq('organization_id', args.organizationId)
    .order('field', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SuggestionRow[];
}

export function checkApprovalGate(rows: SuggestionRow[]): { ok: boolean; missing: string[] } {
  const byStatus = new Map(rows.map((row) => [row.field, row.status] as const));
  const missing = GATE_REQUIRED_FIELDS.filter((field) => {
    const status = byStatus.get(field);
    return status !== 'APPROVED' && status !== 'EDITED';
  });
  const approvedCount = rows.filter((row) => row.status === 'APPROVED' || row.status === 'EDITED').length;
  return { ok: missing.length === 0 && approvedCount >= GATE_MIN_APPROVED, missing };
}

export async function writeAuthoritativeFact(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    brandId: string;
    field: string;
    value: string | string[] | Array<{ name: string; description?: string | null }> | null;
    confidence: number | null;
    evidenceIds: string[];
    suggestionId?: string | null;
  },
): Promise<void> {
  const { organizationId, brandId, field, value, confidence, evidenceIds, suggestionId = null } = args;
  const existing = await supabase
    .from('brand_facts')
    .select('id')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .eq('key', field)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    const { error } = await supabase
      .from('brand_facts')
      .update({ value, source_type: 'USER_CONFIRMED', confidence, evidence_source_ids: evidenceIds, approved: true, updated_at: new Date().toISOString() })
      .eq('id', existing.data.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('brand_facts').insert({
      organization_id: organizationId,
      brand_id: brandId,
      key: field,
      value,
      source_type: 'USER_CONFIRMED',
      confidence,
      evidence_source_ids: evidenceIds,
      approved: true,
      source_suggestion_id: suggestionId,
    });
    if (error) throw error;
  }
}

async function writeCuratedEvidenceInsights(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; evidence: EvidenceItem[] },
): Promise<void> {
  const { organizationId, brandId, evidence } = args;
  const claims = evidence.filter((item) => item.claim);
  if (claims.length === 0) return;

  const { data: existing, error: existingError } = await supabase
    .from('brand_insights')
    .select('id,description')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId)
    .eq('category', 'EVIDENCE')
    .eq('metadata->>origin', 'brand-intelligence');
  if (existingError) throw existingError;

  const existingClaims = new Set((existing ?? []).map((row) => row.description));
  const rows = claims
    .filter((item) => !existingClaims.has(item.claim))
    .map((item) => ({
      organization_id: organizationId,
      brand_id: brandId,
      category: 'EVIDENCE',
      title: item.claim.slice(0, 120),
      description: item.claim,
      priority: 3,
      evidence_source_ids: item.sourceId ? [item.sourceId] : [],
      metadata: { origin: 'brand-intelligence', curated: true, claimUrl: item.url },
    }));
  if (rows.length > 0) {
    const { error } = await supabase.from('brand_insights').insert(rows);
    if (error) throw error;
  }
}

export async function approveSuggestion(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; suggestionId: string; userId: string },
): Promise<SuggestionRow> {
  const { organizationId, brandId, suggestionId, userId } = args;
  const { data: row, error } = await supabase
    .from('brand_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .eq('organization_id', organizationId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('SUGGESTION_NOT_FOUND');

  const proposal = row.proposed_value as SuggestionDraft['proposedValue'];
  const value = proposal === null || proposal === undefined ? null : proposal;
  const evidenceIds = (row.evidence as EvidenceItem[])
    .map((item) => item.sourceId)
    .filter((id): id is string => Boolean(id));
  const evidence = row.evidence as EvidenceItem[];

  await writeAuthoritativeFact(supabase, {
    organizationId,
    brandId,
    field: row.field,
    value,
    confidence: row.confidence,
    evidenceIds,
    suggestionId,
  });
  await writeCuratedEvidenceInsights(supabase, { organizationId, brandId, evidence });

  const { error: updateError } = await supabase
    .from('brand_suggestions')
    .update({ status: 'APPROVED', reviewed_at: new Date().toISOString(), reviewed_by: userId, updated_at: new Date().toISOString() })
    .eq('id', suggestionId)
    .eq('organization_id', organizationId);
  if (updateError) throw updateError;

  return { ...row, status: 'APPROVED', reviewed_at: new Date().toISOString() } as SuggestionRow;
}

export async function editSuggestion(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; suggestionId: string; userId: string; editedValue: string | string[] },
): Promise<SuggestionRow> {
  const { organizationId, brandId, suggestionId, userId, editedValue } = args;
  const { data: row, error } = await supabase
    .from('brand_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .eq('organization_id', organizationId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('SUGGESTION_NOT_FOUND');

  await writeAuthoritativeFact(supabase, {
    organizationId,
    brandId,
    field: row.field,
    value: editedValue,
    confidence: null,
    evidenceIds: [],
    suggestionId,
  });

  const { error: updateError } = await supabase
    .from('brand_suggestions')
    .update({
      proposed_value: editedValue,
      status: 'EDITED',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
      updated_at: new Date().toISOString(),
      evidence: [],
      evidence_strength: null,
      confidence: null,
    })
    .eq('id', suggestionId)
    .eq('organization_id', organizationId);
  if (updateError) throw updateError;

  return { ...row, proposed_value: editedValue, status: 'EDITED', reviewed_at: new Date().toISOString() } as SuggestionRow;
}

export async function rejectSuggestion(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; suggestionId: string; userId: string },
): Promise<SuggestionRow> {
  const { organizationId, brandId, suggestionId, userId } = args;
  const { data: row, error } = await supabase
    .from('brand_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .eq('organization_id', organizationId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('SUGGESTION_NOT_FOUND');

  const { error: updateError } = await supabase
    .from('brand_suggestions')
    .update({ status: 'REJECTED', reviewed_at: new Date().toISOString(), reviewed_by: userId, updated_at: new Date().toISOString() })
    .eq('id', suggestionId)
    .eq('organization_id', organizationId);
  if (updateError) throw updateError;

  return { ...row, status: 'REJECTED', reviewed_at: new Date().toISOString() } as SuggestionRow;
}

export type ReviewDeps = {
  provider?: AiProvider | null;
};

export async function regenerateSuggestion(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; suggestionId: string },
  deps: ReviewDeps = {},
): Promise<SuggestionDraft> {
  const { organizationId, brandId, suggestionId } = args;
  const { data: row, error } = await supabase
    .from('brand_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .eq('organization_id', organizationId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('SUGGESTION_NOT_FOUND');

  const def = FIELD_BY_KEY.get(row.field);
  if (!def) throw new Error('UNKNOWN_FIELD');

  const evidence = await loadBrandEvidence(supabase, { organizationId, brandId });
  if (!evidence) throw new Error('NO_RESEARCH_DATA');

  const provider = deps.provider !== undefined ? deps.provider : createDefaultRegistry().default();
  if (!provider) throw new Error('NO_AI_PROVIDER');

  const aiTaskInsert = await supabase.from('ai_tasks').insert({
    organization_id: organizationId,
    brand_id: brandId,
    task_type: 'brand_field_regeneration',
    status: 'RUNNING',
    idempotency_key: `brain-field:${suggestionId}:${Date.now()}`,
    input_metadata: { field: row.field },
    started_at: new Date().toISOString(),
  }).select('id').single();
  if (aiTaskInsert.error) throw aiTaskInsert.error;
  const aiTaskId = aiTaskInsert.data.id;

  try {
    const extraction = await extractWithRetry(provider, evidence.bundle.fragments);
    const draft = deriveSuggestionDraft(def, extraction.result, evidence.bundle.sources, evidence.bundle.sourceIndex);

    const history = [...(row.history ?? [])]
      .concat([{ at: row.updated_at, status: row.status, proposed_value: row.proposed_value, evidence: row.evidence }])
      .slice(-10);

    const { error: updateError } = await supabase
      .from('brand_suggestions')
      .update({
        research_run_id: evidence.researchRunId,
        proposed_value: draft.proposedValue,
        status: draft.found ? 'PENDING' : 'NOT_FOUND',
        evidence: draft.evidence,
        evidence_strength: draft.evidenceStrength,
        sources_examined: draft.sourcesExamined,
        confidence: draft.confidence,
        history,
        updated_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
      })
      .eq('id', suggestionId)
      .eq('organization_id', organizationId);
    if (updateError) throw updateError;

    await supabase
      .from('ai_tasks')
      .update({
        status: 'SUCCEEDED',
        provider: provider.id,
        model: extraction.model,
        output_metadata: { field: row.field, found: draft.found },
        latency_ms: 0,
        finished_at: new Date().toISOString(),
      })
      .eq('id', aiTaskId);

    return draft;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from('ai_tasks')
      .update({
        status: 'FAILED',
        error_code: 'FIELD_REGEN_FAILED',
        error_message: message.slice(0, 600),
        finished_at: new Date().toISOString(),
      })
      .eq('id', aiTaskId);
    throw error;
  }
}