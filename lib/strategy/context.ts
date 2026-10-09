export type StrategyBrandMeta = {
  name: string;
  websiteUrl?: string | null;
  industry?: string | null;
  marketCountry?: string | null;
  targetAudience?: string | null;
  primaryColor?: string | null;
  secondaryColors?: string[];
  brandRules?: Record<string, unknown>;
  audienceDetails?: Record<string, unknown>;
  offerDetails?: Record<string, unknown>;
  positioning?: Record<string, unknown>;
  messaging?: Record<string, unknown>;
  visualIdentity?: Record<string, unknown>;
};
export type StrategySource = { url: string; title?: string | null };
export type StrategyFact = { key: string; value: unknown };
export type StrategyInsight = { category: string; title: string; description?: string | null; priority: number };
export type StrategyEvidenceClaim = { claim: string; sourceUrl?: string | null };
export type BrainSnapshot = { brand: StrategyBrandMeta; facts: StrategyFact[]; insights: StrategyInsight[]; evidenceClaims: StrategyEvidenceClaim[]; sources: StrategySource[]; researchRunId?: string | null };
export const STRATEGY_FACTS_MAX = 5;
export const STRATEGY_INSIGHTS_MAX = 10;
export const STRATEGY_EVIDENCE_CLAIMS_MAX = 8;
export const STRATEGY_SOURCES_MAX = 6;
export const STRATEGY_FACT_VALUE_MAX_CHARS = 350;
export const STRATEGY_INSIGHT_DESC_MAX_CHARS = 250;
export const STRATEGY_BRAND_GUIDELINE_MAX_CHARS = 3_000;
// Bound prompt context so GPT-OSS requests fit an 8K TPM on-demand org
// budget alongside a schema-validated 3K-token strategy response.
export const STRATEGY_CONTEXT_MAX_CHARS = 12_000;

function truncate(text: string, max: number): string { if (text.length <= max) return text; return `${text.slice(0, max).trimEnd()}…`; }
function formatValue(value: unknown): string { if (value === null || value === undefined) return ''; if (typeof value === 'string') return value; if (Array.isArray(value)) return value.map((item) => String(item)).join('; '); if (typeof value === 'object') return JSON.stringify(value); return String(value); }
function formatGuideline(value: unknown): string { return truncate(formatValue(value), STRATEGY_BRAND_GUIDELINE_MAX_CHARS); }

export function summarizeSnapshot(snapshot: BrainSnapshot) {
  return { researchRunId: snapshot.researchRunId ?? null, brand: { name: snapshot.brand.name, websiteUrl: snapshot.brand.websiteUrl ?? null, industry: snapshot.brand.industry ?? null, marketCountry: snapshot.brand.marketCountry ?? null, targetAudience: snapshot.brand.targetAudience ?? null }, facts: snapshot.facts.length, insights: snapshot.insights.length, evidenceClaims: snapshot.evidenceClaims.length, sources: snapshot.sources.length };
}

export function buildStrategyTextContext(snapshot: BrainSnapshot): string {
  const sections: string[] = []; let total = 0;
  const push = (block: string) => { if (total >= STRATEGY_CONTEXT_MAX_CHARS) return; if (sections.length > 0 && total + block.length > STRATEGY_CONTEXT_MAX_CHARS) { const room = STRATEGY_CONTEXT_MAX_CHARS - total; if (room < 100) return; sections.push(block.slice(0, room)); total += room; return; } sections.push(block); total += block.length; };
  const meta = snapshot.brand;
  push(['## BRAND PROFILE', `Name: ${meta.name || '(unknown)'}`, `Website: ${meta.websiteUrl || '(unknown)'}`, `Industry: ${meta.industry || '(unknown)'}`, `Target market: ${meta.marketCountry || '(unknown)'}`, `Known target audience context: ${meta.targetAudience || '(none provided)'}`].join('\n'));
  push(['## HUMAN-PROVIDED BRAND GUIDELINES', 'These are explicit onboarding/brand rules. They are authoritative creative constraints for generated strategy and content.', `Primary brand color: ${meta.primaryColor || '(not specified)'}`, `Secondary brand colors: ${meta.secondaryColors?.length ? meta.secondaryColors.join(', ') : '(not specified)'}`, `Brand rules: ${formatGuideline(meta.brandRules) || '(none provided)'}`, `Audience details: ${formatGuideline(meta.audienceDetails) || '(none provided)'}`, `Offer details: ${formatGuideline(meta.offerDetails) || '(none provided)'}`, `Positioning provided by the user: ${formatGuideline(meta.positioning) || '(none provided)'}`, `Messaging provided by the user: ${formatGuideline(meta.messaging) || '(none provided)'}`, `Visual identity guidance: ${formatGuideline(meta.visualIdentity) || '(none provided)'}`].join('\n'));
  if (snapshot.facts.length > 0) { const facts = snapshot.facts.slice(0, STRATEGY_FACTS_MAX); const blocks = ['## VERIFIED BRAND FACTS (from the Brand Brain)']; for (const fact of facts) { if (blocks.length >= STRATEGY_FACTS_MAX + 1) break; blocks.push(`### ${fact.key}\n${truncate(formatValue(fact.value), STRATEGY_FACT_VALUE_MAX_CHARS)}`); } push(blocks.join('\n')); }
  if (snapshot.insights.length > 0) { const sorted = [...snapshot.insights].sort((a, b) => a.priority - b.priority); const items = sorted.slice(0, STRATEGY_INSIGHTS_MAX).map((insight) => `- [P${insight.priority}] ${insight.category}: ${truncate(insight.title, 200)} — ${insight.description ? truncate(insight.description, STRATEGY_INSIGHT_DESC_MAX_CHARS) : ''}`.replace(/ — $/, '')); push(['## BRAND INSIGHTS (prioritized)', ...items].join('\n')); }
  if (snapshot.evidenceClaims.length > 0) { const items = snapshot.evidenceClaims.slice(0, STRATEGY_EVIDENCE_CLAIMS_MAX).map((claim) => `- ${truncate(claim.claim, 350)}${claim.sourceUrl ? ` (source: ${claim.sourceUrl})` : ''}`); push(['## EVIDENCE CLAIMS (verbatim from research)', ...items].join('\n')); }
  if (snapshot.sources.length > 0) { const items = snapshot.sources.slice(0, STRATEGY_SOURCES_MAX).map((source) => `- ${source.url} — ${source.title ?? '(no title)'}`); push(['## RESEARCH SOURCES', ...items].join('\n')); }
  return sections.join('\n\n');
}