import type { ExtractedIdentity } from './visual-extraction';
import { normaliseVoice, type BrandVoice } from './voice';

export type BrandAsset = { url: string; type: string; label: string | null };
export type BrandAiProfile = {
  products: string[];
  services: string[];
  audience: string | null;
  personas: { name: string; description?: string | null }[];
  customerTypes: string[];
  painPoints: string[];
  useCases: string[];
  tone: string[];
  terminology: string[];
  recurringClaims: string[];
  messagingThemes: string[];
  valueProposition: string | null;
  differentiators: string[];
  positioningThemes: string[];
  callsToAction: string[];
  productCategories: string[];
  businessModel: string | null;
  primaryMarket: string | null;
  geography: string | null;
  evidence: { claim: string; sourceUrl: string }[];
};

export type BrandVisualIdentity = {
  logoUrl: string | null;
  faviconUrl: string | null;
  palette: { hex: string; role: string; occurrences: number; sources: string[] }[];
  fonts: { family: string; source: string; evidence: string }[];
  headingFont: string | null;
  bodyFont: string | null;
  voice: BrandVoice;
  socialProfiles: { platform: string; url: string }[];
  assets: BrandAsset[];
  aiProfile: BrandAiProfile | null;
  crawl: { pages: string[]; pageCount: number; stylesheetCount: number } | null;
  inspected: string[];
  warnings: string[];
  detectedAt: string;
};

export const EMPTY_VISUAL_IDENTITY: BrandVisualIdentity = {
  logoUrl: null,
  faviconUrl: null,
  palette: [],
  fonts: [],
  headingFont: null,
  bodyFont: null,
  voice: { tone: [], personality: [], styleNotes: null },
  socialProfiles: [],
  assets: [],
  aiProfile: null,
  crawl: null,
  inspected: [],
  warnings: [],
  detectedAt: '',
};

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim());
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asStringObjectArray(value: unknown): { name: string; description?: string | null }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
    .filter((v) => typeof v.name === 'string')
    .map((v) => ({ name: v.name as string, description: asNullableString(v.description) }));
}

export function parseVisualIdentity(raw: unknown): BrandVisualIdentity {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_VISUAL_IDENTITY;
  const source = raw as Record<string, unknown>;

  const palette = Array.isArray(source.palette)
    ? source.palette
        .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
        .filter((p) => isHex(p.hex))
        .map((p) => ({
          hex: (p.hex as string).toLowerCase(),
          role: typeof p.role === 'string' ? p.role : 'neutral',
          occurrences: typeof p.occurrences === 'number' ? p.occurrences : 0,
          sources: asStringArray(p.sources),
        }))
    : [];

  const fonts = Array.isArray(source.fonts)
    ? source.fonts
        .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
        .filter((f) => typeof f.family === 'string')
        .map((f) => ({
          family: f.family as string,
          source: typeof f.source === 'string' ? f.source : 'css-declaration',
          evidence: typeof f.evidence === 'string' ? f.evidence : '',
        }))
    : [];

  const assets = Array.isArray(source.assets)
    ? source.assets
        .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
        .filter((a) => typeof a.url === 'string')
        .map((a) => ({ url: a.url as string, type: typeof a.type === 'string' ? a.type : 'image', label: asNullableString(a.label) }))
    : [];

  const rawAi = source.aiProfile;
  const aiProfile = rawAi && typeof rawAi === 'object' && !Array.isArray(rawAi)
    ? (() => {
        const a = rawAi as Record<string, unknown>;
        return {
          products: asStringArray(a.products),
          services: asStringArray(a.services),
          audience: asNullableString(a.audience),
          personas: asStringObjectArray(a.personas),
          customerTypes: asStringArray(a.customerTypes),
          painPoints: asStringArray(a.painPoints),
          useCases: asStringArray(a.useCases),
          tone: asStringArray(a.tone),
          terminology: asStringArray(a.terminology),
          recurringClaims: asStringArray(a.recurringClaims),
          messagingThemes: asStringArray(a.messagingThemes),
          valueProposition: asNullableString(a.valueProposition),
          differentiators: asStringArray(a.differentiators),
          positioningThemes: asStringArray(a.positioningThemes),
          callsToAction: asStringArray(a.callsToAction),
          productCategories: asStringArray(a.productCategories),
          businessModel: asNullableString(a.businessModel),
          primaryMarket: asNullableString(a.primaryMarket),
          geography: asNullableString(a.geography),
          evidence: Array.isArray(a.evidence)
            ? a.evidence
                .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
                .filter((e) => typeof e.claim === 'string' && typeof e.sourceUrl === 'string')
                .map((e) => ({ claim: e.claim as string, sourceUrl: e.sourceUrl as string }))
            : [],
        } satisfies BrandAiProfile;
      })()
    : null;

  const crawlRaw = source.crawl;
  const crawl = crawlRaw && typeof crawlRaw === 'object' && !Array.isArray(crawlRaw)
    ? {
        pages: asStringArray((crawlRaw as Record<string, unknown>).pages),
        pageCount: typeof (crawlRaw as Record<string, unknown>).pageCount === 'number' ? (crawlRaw as Record<string, unknown>).pageCount as number : 0,
        stylesheetCount: typeof (crawlRaw as Record<string, unknown>).stylesheetCount === 'number' ? (crawlRaw as Record<string, unknown>).stylesheetCount as number : 0,
      }
    : null;

  return {
    logoUrl: typeof source.logoUrl === 'string' ? source.logoUrl : null,
    faviconUrl: typeof source.faviconUrl === 'string' ? source.faviconUrl : null,
    palette,
    fonts,
    headingFont: typeof source.headingFont === 'string' ? source.headingFont : null,
    bodyFont: typeof source.bodyFont === 'string' ? source.bodyFont : null,
    voice: normaliseVoice(source.voice),
    socialProfiles: Array.isArray(source.socialProfiles)
      ? source.socialProfiles
          .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
          .filter((s) => typeof s.url === 'string')
          .map((s) => ({ platform: typeof s.platform === 'string' ? s.platform : 'Profile', url: s.url as string }))
      : [],
    assets,
    aiProfile,
    crawl,
    inspected: asStringArray(source.inspected),
    warnings: asStringArray(source.warnings),
    detectedAt: typeof source.detectedAt === 'string' ? source.detectedAt : '',
  };
}

export function resolveFontRoles(fonts: { family: string }[]): { headingFont: string | null; bodyFont: string | null } {
  if (fonts.length === 0) return { headingFont: null, bodyFont: null };
  return { headingFont: fonts[0]?.family ?? null, bodyFont: fonts[1]?.family ?? fonts[0]?.family ?? null };
}

export function toVisualIdentity(identity: ExtractedIdentity & {
  assets?: BrandAsset[];
  aiProfile?: BrandAiProfile | null;
  crawl?: BrandVisualIdentity['crawl'];
}, voice: Partial<BrandVoice> = {}): BrandVisualIdentity {
  const { headingFont, bodyFont } = resolveFontRoles(identity.fonts);
  return {
    logoUrl: identity.logoUrl,
    faviconUrl: identity.faviconUrl,
    palette: identity.palette.map((c) => ({ hex: c.hex, role: c.role, occurrences: c.occurrences, sources: c.sources })),
    fonts: identity.fonts.map((f) => ({ family: f.family, source: f.source, evidence: f.evidence })),
    headingFont,
    bodyFont,
    voice: normaliseVoice(voice),
    socialProfiles: identity.socialProfiles,
    assets: identity.assets ?? [],
    aiProfile: identity.aiProfile ?? null,
    crawl: identity.crawl ?? null,
    inspected: identity.inspected,
    warnings: identity.warnings,
    detectedAt: new Date().toISOString(),
  };
}

export type BrandIdentityRow = {
  name: string | null;
  description: string | null;
  industry: string | null;
  primary_color: string | null;
  secondary_colors: string[] | null;
  visual_identity: unknown;
  positioning: unknown;
  messaging: unknown;
  audience_details: unknown;
};

export function readIdentity(row: BrandIdentityRow) {
  const visual = parseVisualIdentity(row.visual_identity);
  const positioning = (row.positioning ?? {}) as Record<string, unknown>;
  const messaging = (row.messaging ?? {}) as Record<string, unknown>;
  const audience = (row.audience_details ?? {}) as Record<string, unknown>;
  const ai = visual.aiProfile;

  const primary = isHex(row.primary_color) ? row.primary_color.toLowerCase() : null;
  const secondary = asStringArray(row.secondary_colors).filter(isHex).map((c) => c.toLowerCase());
  const palette = visual.palette.length
    ? visual.palette
    : [primary, ...secondary].filter((v): v is string => Boolean(v)).map((hex, index) => ({ hex, role: index === 0 ? 'primary' : 'secondary', occurrences: 0, sources: [] }));

  return {
    name: row.name,
    description: row.description,
    industry: row.industry,
    primaryColor: primary ?? palette.find((c) => c.role === 'primary')?.hex ?? null,
    palette,
    fonts: visual.fonts,
    headingFont: visual.headingFont,
    bodyFont: visual.bodyFont,
    logoUrl: visual.logoUrl,
    faviconUrl: visual.faviconUrl,
    voice: visual.voice,
    socialProfiles: visual.socialProfiles,
    assets: visual.assets,
    aiProfile: ai,
    crawl: visual.crawl,
    inspected: visual.inspected,
    warnings: visual.warnings,
    detectedAt: visual.detectedAt,
    valueProposition: ai?.valueProposition ?? (typeof positioning.valueProposition === 'string' ? positioning.valueProposition : null),
    messagingSummary: typeof messaging.brandMessaging === 'string' ? messaging.brandMessaging : null,
    toneOfVoice: ai?.tone.length ? ai.tone : asStringArray(messaging.toneOfVoice),
    terminology: ai?.terminology.length ? ai.terminology : asStringArray(messaging.terminology),
    audienceSummary: ai?.audience ?? (typeof audience.summary === 'string' ? audience.summary : null),
    personas: ai?.personas.length ? ai.personas : Array.isArray(audience.personas)
      ? (audience.personas as unknown[]).filter((p): p is { name: string; description?: string } => Boolean(p) && typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string')
      : [],
  };
}

export type BrandIdentity = ReturnType<typeof readIdentity>;
