import type { ExtractedIdentity } from './visual-extraction';
import { normaliseVoice, type BrandVoice } from './voice';

/**
 * Mapping between the deterministic website scan and the columns that already
 * exist on `public.brands` (added by migration 0027_product_modernization).
 *
 * There is deliberately no new table: `visual_identity` is a jsonb bag and is
 * already read by strategy and content generation, so extending its documented
 * shape is enough. Anything the website did not evidence stays null / empty so
 * the UI can render "not detected" rather than a fabricated value.
 */

export type BrandVisualIdentity = {
  logoUrl: string | null;
  faviconUrl: string | null;
  palette: { hex: string; role: string; occurrences: number; sources: string[] }[];
  fonts: { family: string; source: string; evidence: string }[];
  headingFont: string | null;
  bodyFont: string | null;
  voice: BrandVoice;
  socialProfiles: { platform: string; url: string }[];
  /** What the scan looked at, so a human can judge how much to trust it. */
  inspected: string[];
  warnings: string[];
  /** ISO timestamp of the scan that produced this payload. */
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

/** Read `visual_identity` back out of the database without trusting its shape. */
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
          .map((s) => ({
            platform: typeof s.platform === 'string' ? s.platform : 'Profile',
            url: s.url as string,
          }))
      : [],
    inspected: asStringArray(source.inspected),
    warnings: asStringArray(source.warnings),
    detectedAt: typeof source.detectedAt === 'string' ? source.detectedAt : '',
  };
}

/**
 * Decide which font plays the heading role.
 *
 * Heuristic, stated plainly: the first distinct family a page declares is
 * overwhelmingly the display/heading face, because `:root`/`:root`-equivalent
 * and the first `@font-face`/`font-family` declarations in a stylesheet are the
 * primary typography. When there is only one family it is used for both roles.
 */
export function resolveFontRoles(fonts: { family: string }[]): {
  headingFont: string | null;
  bodyFont: string | null;
} {
  if (fonts.length === 0) return { headingFont: null, bodyFont: null };
  const headingFont = fonts[0]?.family ?? null;
  const bodyFont = fonts[1]?.family ?? headingFont;
  return { headingFont, bodyFont };
}

export function toVisualIdentity(
  identity: ExtractedIdentity,
  voice: Partial<BrandVoice> = {},
): BrandVisualIdentity {
  const { headingFont, bodyFont } = resolveFontRoles(identity.fonts);
  return {
    logoUrl: identity.logoUrl,
    faviconUrl: identity.faviconUrl,
    palette: identity.palette.map((c) => ({
      hex: c.hex,
      role: c.role,
      occurrences: c.occurrences,
      sources: c.sources,
    })),
    fonts: identity.fonts.map((f) => ({ family: f.family, source: f.source, evidence: f.evidence })),
    headingFont,
    bodyFont,
    voice: normaliseVoice(voice),
    socialProfiles: identity.socialProfiles,
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

/**
 * Build the PATCH body for `PUT /api/brands/:id` from a detected identity.
 * Only fields that actually carry evidence are included, so a partial scan can
 * never blank out values a human already set.
 */
export function buildIdentityUpdate(
  identity: ExtractedIdentity,
  voice: Partial<BrandVoice> = {},
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    visual_identity: toVisualIdentity(identity, voice),
  };

  if (identity.brandName) update.name = identity.brandName;
  if (identity.description) update.description = identity.description;
  if (identity.primaryColor) update.primary_color = identity.primaryColor;
  if (identity.secondaryColors.length > 0) update.secondary_colors = identity.secondaryColors;

  return update;
}

/** Read a persisted brand row into the shape the workspace renders. */
export function readIdentity(row: BrandIdentityRow) {
  const visual = parseVisualIdentity(row.visual_identity);
  const positioning = (row.positioning ?? {}) as Record<string, unknown>;
  const messaging = (row.messaging ?? {}) as Record<string, unknown>;
  const audience = (row.audience_details ?? {}) as Record<string, unknown>;

  const primary = isHex(row.primary_color) ? row.primary_color.toLowerCase() : null;
  const secondary = asStringArray(row.secondary_colors).filter(isHex).map((c) => c.toLowerCase());

  // Prefer the dedicated columns; fall back to palette roles so a brand that
  // only ever had a scan still renders a complete colour section.
  const palette = visual.palette.length
    ? visual.palette
    : [primary, ...secondary]
        .filter((v): v is string => Boolean(v))
        .map((hex, index) => ({ hex, role: index === 0 ? 'primary' : 'secondary', occurrences: 0, sources: [] }));

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
    inspected: visual.inspected,
    warnings: visual.warnings,
    detectedAt: visual.detectedAt,
    valueProposition: typeof positioning.valueProposition === 'string' ? positioning.valueProposition : null,
    messagingSummary: typeof messaging.brandMessaging === 'string' ? messaging.brandMessaging : null,
    toneOfVoice: asStringArray(messaging.toneOfVoice),
    terminology: asStringArray(messaging.terminology),
    audienceSummary: typeof audience.summary === 'string' ? audience.summary : null,
    personas: Array.isArray(audience.personas)
      ? (audience.personas as unknown[]).filter(
          (p): p is { name: string; description?: string } =>
            Boolean(p) && typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string',
        )
      : [],
  };
}

export type BrandIdentity = ReturnType<typeof readIdentity>;