import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrandIntelligence, EvidenceFragment } from '@/lib/ai/brand-intelligence';

export const SUGGESTION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EDITED', 'NOT_FOUND'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export type SuggestionKind = 'text' | 'list' | 'persona';

export type EvidenceStrength = 'strong' | 'partial' | 'weak';

export type EvidenceItem = {
  sourceId: string | null;
  url: string;
  urlTitle: string | null;
  excerpt: string | null;
  claim: string;
  strength: EvidenceStrength;
};

export type FieldValue = string | string[] | Array<{ name: string; description?: string | null }>;

export type FieldDef = {
  field: string;
  label: string;
  section: string;
  kind: SuggestionKind;
  pick: (intelligence: BrandIntelligence) => FieldValue | null | undefined;
};

export const identity: FieldDef[] = [
  { field: 'brand_name', label: 'Brand name', section: 'identity', kind: 'text', pick: (i) => i.identity.brandName },
  { field: 'brand_description', label: 'What the company does', section: 'identity', kind: 'text', pick: (i) => i.identity.companyDescription },
  { field: 'industry', label: 'Industry', section: 'identity', kind: 'text', pick: (i) => i.identity.industry },
  { field: 'business_model', label: 'Business model', section: 'identity', kind: 'text', pick: (i) => i.identity.businessModel },
  { field: 'primary_market', label: 'Primary market', section: 'identity', kind: 'text', pick: (i) => i.identity.primaryMarket },
  { field: 'geography', label: 'Geographic focus', section: 'identity', kind: 'text', pick: (i) => i.identity.geography },
  { field: 'product_categories', label: 'Products & services', section: 'identity', kind: 'list', pick: (i) => i.identity.productCategories },
];

export const audience: FieldDef[] = [
  { field: 'target_audience', label: 'Audience summary', section: 'audience', kind: 'text', pick: (i) => i.audience.targetAudience },
  { field: 'buyer_personas', label: 'Ideal customer profiles', section: 'audience', kind: 'persona', pick: (i) => i.audience.buyerPersonas },
  { field: 'customer_types', label: 'Customer types', section: 'audience', kind: 'list', pick: (i) => i.audience.customerTypes },
  { field: 'pain_points', label: 'Pain points', section: 'audience', kind: 'list', pick: (i) => i.audience.painPoints },
  { field: 'use_cases', label: 'Use cases', section: 'audience', kind: 'list', pick: (i) => i.audience.useCases },
];

export const positioning: FieldDef[] = [
  { field: 'value_proposition', label: 'Value proposition', section: 'positioning', kind: 'text', pick: (i) => i.positioning.valueProposition },
  { field: 'differentiators', label: 'Differentiators', section: 'positioning', kind: 'list', pick: (i) => i.positioning.differentiators },
  { field: 'positioning_themes', label: 'Market positioning', section: 'positioning', kind: 'list', pick: (i) => i.positioning.positioningThemes },
  { field: 'brand_messaging', label: 'Messaging direction', section: 'positioning', kind: 'text', pick: (i) => i.positioning.brandMessaging },
];

export const offer: FieldDef[] = [
  { field: 'products_services', label: 'Products & services', section: 'offer', kind: 'list', pick: (i) => i.offer.productsAndServices },
  { field: 'key_features', label: 'Key features', section: 'offer', kind: 'list', pick: (i) => i.offer.keyFeatures },
  { field: 'benefits', label: 'Customer benefits', section: 'offer', kind: 'list', pick: (i) => i.offer.benefits },
  { field: 'calls_to_action', label: 'Primary CTAs', section: 'offer', kind: 'list', pick: (i) => i.offer.callsToAction },
];

export const messaging: FieldDef[] = [
  { field: 'tone_of_voice', label: 'Voice attributes', section: 'messaging', kind: 'list', pick: (i) => i.messaging.toneOfVoice },
  { field: 'terminology', label: 'Brand vocabulary', section: 'messaging', kind: 'list', pick: (i) => i.messaging.terminology },
];

export const seo: FieldDef[] = [
  { field: 'important_topics', label: 'Key topics', section: 'seo', kind: 'list', pick: (i) => i.seo.importantTopics },
  { field: 'keyword_themes', label: 'SEO keyword themes', section: 'seo', kind: 'list', pick: (i) => i.seo.keywordThemes },
];

export const competition: FieldDef[] = [
  { field: 'competitors', label: 'Named competitors', section: 'competition', kind: 'list', pick: (i) => i.competition.namedCompetitors },
  { field: 'alternatives', label: 'Alternatives', section: 'competition', kind: 'list', pick: (i) => i.competition.alternatives },
];

export const SECTIONS = [
  { key: 'identity', label: 'Identity', fields: identity },
  { key: 'audience', label: 'Audience', fields: audience },
  { key: 'positioning', label: 'Positioning', fields: positioning },
  { key: 'offer', label: 'Offer', fields: offer },
  { key: 'messaging', label: 'Messaging', fields: messaging },
  { key: 'seo', label: 'SEO topics', fields: seo },
  { key: 'competition', label: 'Competition', fields: competition },
] as const;

export const ALL_FIELDS: FieldDef[] = [...identity, ...audience, ...positioning, ...offer, ...messaging, ...seo, ...competition];

export const FIELD_BY_KEY = new Map(ALL_FIELDS.map((def) => [def.field, def]));

export function fieldLabel(field: string): string {
  return FIELD_BY_KEY.get(field)?.label ?? field;
}

export function isEmptyValue(value: FieldValue | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    return value.every((entry) => {
      if (typeof entry === 'string') return entry.trim() === '';
      return !entry.name || entry.name.trim() === '';
    });
  }
  return false;
}

export function fieldSummary(value: FieldValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : `${entry.name.trim()}${entry.description ? ` — ${entry.description.trim()}` : ''}`))
      .filter(Boolean)
      .join(' · ');
  }
  return '';
}

const STOP_WORDS = new Set([
  'with', 'their', 'they', 'that', 'this', 'from', 'have', 'your', 'youre', 'will', 'would', 'about', 'which', 'there', 'were',
  'into', 'them', 'been', 'only', 'each', 'other', 'than', 'then', 'over', 'also', 'these', 'those', 'while', 'through',
  'because', 'between', 'using', 'should', 'could', 'where', 'after', 'before', 'customer', 'customers',
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 4)
    .filter((token) => !STOP_WORDS.has(token));
}

function countOverlap(claimTokens: string[], valueTokens: string[]): number {
  const claimSet = new Set(claimTokens);
  let overlaps = 0;
  for (const token of valueTokens) {
    if (claimSet.has(token)) overlaps += 1;
  }
  return overlaps;
}

const EXCERPT_RADIUS = 160;

function findExcerpt(text: string, tokens: string[]): string | null {
  const lower = text.toLowerCase();
  const ranked = [...tokens].sort((a, b) => b.length - a.length);
  for (const token of ranked) {
    const index = lower.indexOf(token);
    if (index >= 0) {
      const start = Math.max(0, index - EXCERPT_RADIUS);
      const end = Math.min(text.length, index + token.length + EXCERPT_RADIUS);
      const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
      if (excerpt) return excerpt;
    }
  }
  return null;
}

export type SuggestionDraft = {
  field: string;
  label: string;
  section: string;
  kind: SuggestionKind;
  proposedValue: FieldValue | null;
  found: boolean;
  status: 'PENDING' | 'NOT_FOUND';
  evidence: EvidenceItem[];
  evidenceStrength: EvidenceStrength | null;
  sourcesExamined: number;
  confidence: number;
};

export function deriveSuggestionDraft(
  def: FieldDef,
  intelligence: BrandIntelligence,
  sources: EvidenceFragment[],
  sourceIndex: Map<string, string>,
): SuggestionDraft {
  const raw = def.pick(intelligence);
  const value: FieldValue | null = raw === undefined ? null : raw;
  const found = !isEmptyValue(value);
  const sourcesExamined = sources.length;

  if (!found) {
    return {
      field: def.field,
      label: def.label,
      section: def.section,
      kind: def.kind,
      proposedValue: null,
      found: false,
      status: 'NOT_FOUND',
      evidence: [],
      evidenceStrength: null,
      sourcesExamined,
      confidence: 0.6,
    };
  }

  const primaryText = fieldSummary(value);
  const valueTokens = tokenize(primaryText);
  const evidence: EvidenceItem[] = [];

  for (const entry of intelligence.evidence) {
    const claimTokens = tokenize(entry.claim);
    const overlap = countOverlap(claimTokens, valueTokens);
    if (overlap === 0) continue;

    const sourceTexts = sources.filter((source) => source.url === entry.sourceUrl);
    const sourceText = sourceTexts[0]?.text ?? '';
    const strength: EvidenceStrength = overlap >= 2 ? 'strong' : 'partial';
    const excerpt = sourceText ? findExcerpt(sourceText, valueTokens) : null;

    evidence.push({
      sourceId: sourceIndex.get(entry.sourceUrl) ?? null,
      url: entry.sourceUrl,
      urlTitle: sourceTexts[0]?.title ?? null,
      excerpt,
      claim: entry.claim,
      strength,
    });
  }

  if (evidence.length === 0) {
    return {
      field: def.field,
      label: def.label,
      section: def.section,
      kind: def.kind,
      proposedValue: value,
      found: true,
      status: 'PENDING',
      evidence: [],
      evidenceStrength: 'weak',
      sourcesExamined,
      confidence: 0.6,
    };
  }

  evidence.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'strong' ? -1 : 1));
  const capped = evidence.slice(0, 6);
  const evidenceStrength: EvidenceStrength = capped.some((item) => item.strength === 'strong')
    ? 'strong'
    : capped.some((item) => item.strength === 'partial')
      ? 'partial'
      : 'weak';
  const confidence = evidenceStrength === 'strong' ? 0.95 : evidenceStrength === 'partial' ? 0.85 : 0.6;

  return {
    field: def.field,
    label: def.label,
    section: def.section,
    kind: def.kind,
    proposedValue: value,
    found: true,
    status: 'PENDING',
    evidence: capped,
    evidenceStrength,
    sourcesExamined,
    confidence,
  };
}

export function deriveAllSuggestionDrafts(
  intelligence: BrandIntelligence,
  sources: EvidenceFragment[],
  sourceIndex: Map<string, string>,
): SuggestionDraft[] {
  return ALL_FIELDS.map((def) => deriveSuggestionDraft(def, intelligence, sources, sourceIndex));
}

export type SuggestionRow = {
  id: string;
  field: string;
  label: string;
  kind: string;
  proposed_value: string | string[] | Array<{ name: string; description?: string | null }> | null;
  status: SuggestionStatus;
  evidence: EvidenceItem[];
  evidence_strength: EvidenceStrength | null;
  sources_examined: number;
  confidence: number | null;
  history: unknown[];
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

const AUTO_MANAGED_STATUSES = new Set<SuggestionStatus>(['PENDING', 'REJECTED', 'NOT_FOUND']);

async function existingByField(supabase: SupabaseClient, brandId: string, organizationId: string): Promise<Map<string, SuggestionRow>> {
  const { data, error } = await supabase
    .from('brand_suggestions')
    .select('*')
    .eq('brand_id', brandId)
    .eq('organization_id', organizationId);
  if (error) throw error;
  const map = new Map<string, SuggestionRow>();
  for (const row of data ?? []) map.set(row.field, row as SuggestionRow);
  return map;
}

export async function persistSuggestionDrafts(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; researchRunId: string },
  drafts: SuggestionDraft[],
): Promise<{ created: number; updated: number; untouched: number }> {
  const { organizationId, brandId, researchRunId } = args;
  const existing = await existingByField(supabase, brandId, organizationId);

  let created = 0;
  let updated = 0;
  let untouched = 0;

  for (const draft of drafts) {
    const row = existing.get(draft.field);
    const proposedSerialized = JSON.stringify(draft.proposedValue);

    if (row) {
      if (!AUTO_MANAGED_STATUSES.has(row.status)) {
        untouched += 1;
        continue;
      }
      const currentProposed = JSON.stringify(row.proposed_value);
      const sameValue = currentProposed === proposedSerialized && row.status === draft.status;
      if (sameValue) {
        untouched += 1;
        continue;
      }
      const history = [...(row.history ?? [])]
        .concat([{ at: row.updated_at, status: row.status, proposed_value: row.proposed_value, evidence: row.evidence }])
        .slice(-10);
      const { error } = await supabase
        .from('brand_suggestions')
        .update({
          research_run_id: researchRunId,
          proposed_value: draft.proposedValue,
          status: draft.status,
          evidence: draft.evidence,
          evidence_strength: draft.evidenceStrength,
          sources_examined: draft.sourcesExamined,
          confidence: draft.confidence,
          history,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('organization_id', organizationId);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await supabase.from('brand_suggestions').insert({
        organization_id: organizationId,
        brand_id: brandId,
        research_run_id: researchRunId,
        field: draft.field,
        label: draft.label,
        kind: draft.kind,
        proposed_value: draft.proposedValue,
        status: draft.status,
        evidence: draft.evidence,
        evidence_strength: draft.evidenceStrength,
        sources_examined: draft.sourcesExamined,
        confidence: draft.confidence,
      });
      if (error) throw error;
      created += 1;
    }
  }

  return { created, updated, untouched };
}