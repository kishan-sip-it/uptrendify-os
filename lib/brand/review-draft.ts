import type { ExtractedColor, ExtractedFont, ExtractedIdentity } from './visual-extraction';
import { resolveFontRoles, toVisualIdentity, type BrandAiProfile } from './identity-mapping';

/**
 * Pre-creation review draft.
 *
 * The Brand IQ review screen lets the user edit and clear the same field
 * categories the saved Brand Profile editors support, BEFORE the brand is
 * created. The draft holds the authoritative reviewed values; the create
 * flow then persists exactly what the user reviewed (including intentional
 * clears as null/[]), so no later merge or default can silently restore the
 * untouched scan output.
 *
 * Every value here lives in exactly ONE logical place. buildCreatePatchPayload
 * fans each value out to every stored location that the post-creation Brand
 * Profile reads (top-level columns, positioning/offer/audience/messaging JSON
 * and visual_identity.aiProfile), because readIdentity() falls back between
 * those locations — a cleared value must be cleared in all of them or the
 * fallback chain resurrects the scanned value.
 */
export type ReviewDraft = {
  description: string | null;
  industry: string | null;
  targetAudience: string | null;
  valueProposition: string | null;
  differentiators: string[];
  positioningThemes: string[];
  businessModel: string | null;
  primaryMarket: string | null;
  geography: string | null;
  products: string[];
  services: string[];
  keyFeatures: string[];
  benefits: string[];
  pricingSignals: string[];
  productCategories: string[];
  callsToAction: string[];
  painPoints: string[];
  useCases: string[];
  personas: { name: string; description?: string | null }[];
  customerTypes: string[];
  tone: string[];
  terminology: string[];
  recurringClaims: string[];
  messagingThemes: string[];
  seo: { importantTopics: string[]; keywordThemes: string[]; contentGaps: string[]; searchIntentOpportunities: string[] };
  competition: { namedCompetitors: string[]; alternatives: string[]; differentiationClaims: string[] };
  primaryColor: string | null;
  palette: { hex: string; role: string }[];
  headingFont: string | null;
  bodyFont: string | null;
};

/** Minimal structural view of the scan identity the draft is built from. */
export type ReviewDraftSource = {
  description: string | null;
  palette: ExtractedColor[];
  primaryColor: string | null;
  fonts: ExtractedFont[];
  aiProfile?: (BrandAiProfile & {
    /** Scan-only enrichment fields stored under offerDetails, not aiProfile. */
    keyFeatures?: string[];
    benefits?: string[];
    pricingSignals?: string[];
    seo?: { importantTopics: string[]; keywordThemes: string[]; contentGaps: string[]; searchIntentOpportunities: string[] } | null;
    competition?: { namedCompetitors: string[]; alternatives: string[]; differentiationClaims: string[] } | null;
  }) | null;
};

const EMPTY_SEO = { importantTopics: [], keywordThemes: [], contentGaps: [], searchIntentOpportunities: [] };
const EMPTY_COMPETITION = { namedCompetitors: [], alternatives: [], differentiationClaims: [] };

/** Build the editable review draft from a finished website scan. */
export function buildReviewDraft(identity: ReviewDraftSource): ReviewDraft {
  const ai = identity.aiProfile ?? null;
  const roles = resolveFontRoles(identity.fonts);
  return {
    description: identity.description ?? null,
    industry: ai?.industry ?? null,
    targetAudience: ai?.audience ?? null,
    valueProposition: ai?.valueProposition ?? null,
    differentiators: ai?.differentiators ?? [],
    positioningThemes: ai?.positioningThemes ?? [],
    businessModel: ai?.businessModel ?? null,
    primaryMarket: ai?.primaryMarket ?? null,
    geography: ai?.geography ?? null,
    products: ai?.products ?? [],
    services: ai?.services ?? [],
    // Scan enrichment supplies these under offerDetails; the review form must
    // preserve them so creation persists what the scan actually found.
    keyFeatures: ai?.keyFeatures ?? [],
    benefits: ai?.benefits ?? [],
    pricingSignals: ai?.pricingSignals ?? [],
    productCategories: ai?.productCategories ?? [],
    callsToAction: ai?.callsToAction ?? [],
    painPoints: ai?.painPoints ?? [],
    useCases: ai?.useCases ?? [],
    personas: ai?.personas ?? [],
    customerTypes: ai?.customerTypes ?? [],
    tone: ai?.tone ?? [],
    terminology: ai?.terminology ?? [],
    recurringClaims: ai?.recurringClaims ?? [],
    messagingThemes: ai?.messagingThemes ?? [],
    seo: ai?.seo ?? { ...EMPTY_SEO },
    competition: ai?.competition ?? { ...EMPTY_COMPETITION },
    primaryColor: identity.primaryColor
      ?? identity.palette.find((color) => color.role === 'primary')?.hex
      ?? null,
    palette: identity.palette.map((color) => ({ hex: color.hex, role: color.role })),
    headingFont: roles.headingFont,
    bodyFont: roles.bodyFont,
  };
}

/**
 * A reviewed primary colour mirrors the saved-profile behaviour
 * (savePrimaryColor): the chosen hex becomes the primary palette entry, an
 * existing entry for the same hex is promoted, duplicates are removed, and the
 * previous primary entry is replaced in place.
 */
export function applyPrimaryColorToDraft(
  draft: ReviewDraft,
  primaryColor: string,
): ReviewDraft {
  const normalized = primaryColor.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) return draft;
  const hadPrimaryRole = draft.palette.some((color) => color.role === 'primary');
  const seen = new Set<string>();
  const palette: { hex: string; role: string }[] = [];
  const push = (hex: string, role: string) => {
    const key = hex.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      palette.push({ hex: key, role });
    }
  };
  if (!hadPrimaryRole) push(normalized, 'primary');
  for (const color of draft.palette) {
    if (color.role === 'primary' || color.hex.toLowerCase() === normalized) push(normalized, 'primary');
    else push(color.hex, color.role);
  }
  return { ...draft, primaryColor: normalized, palette };
}

/** Fan the draft's aiProfile-shaped values out, preserving scanned evidence. */
function buildDraftAiProfile(draft: ReviewDraft, existing: ReviewDraftSource['aiProfile']): BrandAiProfile {
  const base: BrandAiProfile = existing
    ? (() => {
        const { seo: _seo, competition: _competition, ...rest } = existing;
        return { ...rest, evidence: rest.evidence ?? [] };
      })()
    : {
        products: [], services: [], audience: null, personas: [], customerTypes: [], painPoints: [], useCases: [],
        tone: [], terminology: [], recurringClaims: [], messagingThemes: [], valueProposition: null,
        differentiators: [], positioningThemes: [], callsToAction: [], productCategories: [],
        industry: null, businessModel: null, primaryMarket: null, geography: null, evidence: [],
      };
  return {
    ...base,
    industry: draft.industry,
    audience: draft.targetAudience,
    valueProposition: draft.valueProposition,
    differentiators: draft.differentiators,
    positioningThemes: draft.positioningThemes,
    businessModel: draft.businessModel,
    primaryMarket: draft.primaryMarket,
    geography: draft.geography,
    products: draft.products,
    services: draft.services,
    productCategories: draft.productCategories,
    callsToAction: draft.callsToAction,
    painPoints: draft.painPoints,
    useCases: draft.useCases,
    personas: draft.personas,
    customerTypes: draft.customerTypes,
    tone: draft.tone,
    terminology: draft.terminology,
    recurringClaims: draft.recurringClaims,
    messagingThemes: draft.messagingThemes,
  };
}

/**
 * Build the POST-create PATCH payload from the reviewed draft. Cleared values
 * are written as explicit null/[] in EVERY stored location the Brand Profile
 * reads, so an intentional clear persists and the scanned value cannot be
 * silently restored by the readIdentity() fallback chain.
 */
export function buildCreatePatchPayload(
  draft: ReviewDraft,
  identity: ExtractedIdentity & {
    aiProfile?: ReviewDraftSource['aiProfile'];
    assets?: { url: string; type: string; label: string | null }[];
    crawl?: { pages: string[]; pageCount: number; stylesheetCount: number } | null;
    inspected?: string[];
    warnings?: string[];
  },
): Record<string, unknown> {
  const primary = draft.primaryColor ?? draft.palette.find((color) => color.role === 'primary')?.hex ?? null;
  // secondary_colors is capped at 8 by the PATCH schema (large scanned palettes
  // legitimately exceed that); the complete palette still persists in
  // visual_identity.palette, which is what the Brand Profile renders.
  const secondaryColors = draft.palette
    .filter((color) => color.hex.toLowerCase() !== primary?.toLowerCase())
    .map((color) => color.hex)
    .slice(0, 8);

  const baseVisual = toVisualIdentity(identity, { tone: draft.tone });
  const paletteRows = draft.palette.map((color) => {
    const scanned = identity.palette.find((entry) => entry.hex.toLowerCase() === color.hex.toLowerCase());
    return {
      hex: color.hex.toLowerCase(),
      role: color.role,
      occurrences: scanned?.occurrences ?? 0,
      sources: scanned?.sources ?? ['user'],
    };
  });
  const visualIdentity = {
    ...baseVisual,
    palette: paletteRows,
    headingFont: draft.headingFont,
    bodyFont: draft.bodyFont,
    aiProfile: buildDraftAiProfile(draft, identity.aiProfile ?? null),
  };

  return {
    description: draft.description,
    primaryColor: primary,
    secondaryColors,
    industry: draft.industry,
    targetAudience: draft.targetAudience,
    positioning: {
      valueProposition: draft.valueProposition,
      differentiators: draft.differentiators,
      positioningThemes: draft.positioningThemes,
      competitiveContext: draft.competition,
      seoResearch: draft.seo,
    },
    offerDetails: {
      products: draft.products,
      services: draft.services,
      keyFeatures: draft.keyFeatures,
      benefits: draft.benefits,
      pricingSignals: draft.pricingSignals,
      productCategories: draft.productCategories,
      callsToAction: draft.callsToAction,
      painPoints: draft.painPoints,
      useCases: draft.useCases,
    },
    audienceDetails: {
      summary: draft.targetAudience,
      personas: draft.personas,
      customerTypes: draft.customerTypes,
    },
    messaging: {
      toneOfVoice: draft.tone,
      terminology: draft.terminology,
      recurringClaims: draft.recurringClaims,
      messagingThemes: draft.messagingThemes,
      brandMessaging: draft.valueProposition,
    },
    visualIdentity,
  };
}
