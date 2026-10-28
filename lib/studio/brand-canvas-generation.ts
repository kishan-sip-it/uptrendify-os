import { CONTENT_PAGE_SIZES, defaultPageSizeForChannel, hashId, type ContentDocPage, type ContentPageSizeId } from '@/lib/content/document';
import { buildTemplatePageSpec } from '@/lib/studio/template-library/build';
import { contrastRatio, mixOver, relativeLuminance, requiredRatio } from '@/lib/studio/template-library/contrast';
import { quoteCard, storyPromo, typePoster, listiclePost, type CopyBag } from '@/lib/studio/template-library/archetypes';
import type { TemplatePalette } from '@/lib/studio/template-library/types';
import type { BrandEssentials } from '@/lib/studio/apply-brand-essentials';

/**
 * Brand-driven canvas generation for an EMPTY studio canvas.
 *
 * "Import brand" on a blank page offers to compose a first design straight
 * from the brand: the scanned essentials (palette, fonts, logo) supply the
 * look, and the brand profile (name, positioning, messaging themes, calls to
 * action — everything Brand Brain scanned) supplies usable copy. Everything is
 * deterministic: the same brief always produces byte-identical pages, so
 * ids stay stable and undo/redo never reshuffles layers.
 */

export type BrandCanvasBrief = {
  brandName: string;
  title: string;
  cta: string | null;
  contentType: string | null;
  channel: string | null;
  industry?: string | null;
  audience?: string | null;
  valueProposition?: string | null;
  messagingThemes?: string[];
  callsToAction?: string[];
  painPoints?: string[];
  useCases?: string[];
  /** Stable seed (content id) — picks the layout variant without randomness. */
  seed: string;
};

const FALLBACK_TAGLINE = 'Made with care, made for you.';

/** First usable string from a scanned list, else null. */
function firstLine(values: Array<string | null | undefined> | undefined): string | null {
  for (const value of values ?? []) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length >= 4 && text.length <= 90) return text;
  }
  return null;
}

function shortLines(values: string[] | undefined, max: number, maxLen = 64): string[] {
  return (values ?? [])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length >= 4 && value.length <= maxLen)
    .slice(0, max);
}

/** Small stable string hash → non-negative int (deterministic variant pick).
 * murmur-style finalizer: FNV alone clusters sequential seeds into the same
 * low-bit bucket, which would collapse every content item onto one layout. */
export function briefSeedInt(seed: string, modulo: number): number {
  if (modulo <= 1) return 0;
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) % modulo;
}

/** Readable text colour over a fill: ink when it passes, else the paper/white/black ladder. */
export function readableOn(fill: string, ink: string, paper: string): string {
  const need = requiredRatio(undefined, false);
  for (const candidate of [ink, paper, '#ffffff', '#1d2634', '#000000']) {
    if (contrastRatio(candidate, fill) >= need) return candidate;
  }
  return contrastRatio('#ffffff', fill) >= contrastRatio('#000000', fill) ? '#ffffff' : '#000000';
}

/**
 * Map the scanned brand essentials onto the template palette contract:
 * accent drives buttons/shapes, paper/bg take the scanned light surface, ink
 * is the scanned best dark text colour (contrast-checked against paper).
 */
export function brandEssentialsPalette(essentials: BrandEssentials): TemplatePalette {
  const paper = essentials.surface ?? '#ffffff';
  const accent = essentials.accent ?? essentials.colors[0] ?? '#4f8b72';
  const contrastSafePaper = contrastRatio(essentials.ink, paper) >= requiredRatio(undefined, false)
    ? paper
    : mixOver(paper, '#ffffff', 0.55);
  const ink = contrastRatio(essentials.ink, contrastSafePaper) >= requiredRatio(undefined, false)
    ? essentials.ink
    : '#1d2634';
  const onAccent = readableOn(accent, ink, paper);
  // Small accent text over the page paper: darken toward black (light paper)
  // or lift toward white (dark paper) until AA passes — mixing toward the
  // paper colour itself would only LOWER the contrast.
  const accentText = (() => {
    if (contrastRatio(accent, contrastSafePaper) >= requiredRatio(undefined, false)) return accent;
    const toward = relativeLuminance(contrastSafePaper) < 0.18 ? '#ffffff' : '#000000';
    for (const factor of [0.25, 0.4, 0.55, 0.7]) {
      const candidate = mixOver(accent, toward, factor);
      if (contrastRatio(candidate, contrastSafePaper) >= requiredRatio(undefined, false)) return candidate;
    }
    return readableOn(accent, ink, paper);
  })();
  const secondary = essentials.secondary ?? essentials.colors[1] ?? accent;
  return {
    name: 'brand',
    ink,
    accent,
    accentText,
    onAccent,
    soft: mixOver(accent, '#ffffff', 0.86),
    paper,
    bg: paper,
  };
}

// Offer (fabricated discount badges) and productFeature ("Drop your photo
// here" placeholders) are deliberately NOT in the rotation: generated canvases
// must never invent claims or ship template-speak copy.
type ArchetypeId = 'quote' | 'poster' | 'promo' | 'list';

function archetypeFor(brief: BrandCanvasBrief): ArchetypeId {
  const type = (brief.contentType ?? '').trim().toLowerCase();
  if (['social_post', 'social'].includes(type)) return (['quote', 'promo', 'poster'] as const)[briefSeedInt(brief.seed, 3)];
  if (type === 'video_script') return 'promo';
  if (['blog_outline', 'blog_draft', 'landing_page', 'email', 'newsletter'].includes(type)) return (['poster', 'list'] as const)[briefSeedInt(brief.seed, 2)];
  return (['poster', 'quote', 'list'] as const)[briefSeedInt(brief.seed, 3)];
}

/** Two-stop brand gradient: scanned surface into the accent family. */
function brandGradient(essentials: BrandEssentials, dark: boolean): { from: string; to: string; angle: number } {
  const accent = essentials.accent ?? essentials.colors[0] ?? '#4f8b72';
  if (dark) {
    return { from: mixOver(accent, '#101322', 0.78), to: mixOver(accent, '#101322', 0.35), angle: 145 };
  }
  return {
    from: essentials.surface ?? '#ffffff',
    to: mixOver(accent, '#ffffff', 0.78),
    angle: 160,
  };
}

function buildCopyBag(brief: BrandCanvasBrief): CopyBag {
  const brand = brief.brandName.trim() || 'Our brand';
  const cta = brief.cta?.trim() || firstLine([brief.callsToAction?.[0]]);
  const messaging = firstLine([brief.valueProposition, ...(brief.messagingThemes ?? [])]);
  const pain = firstLine([(brief.painPoints ?? [])[0]]);
  return {
    eyebrow: industryOrAudience(brief) ?? brand,
    title: brief.title.trim() || FALLBACK_TAGLINE,
    subtitle: messaging ?? undefined,
    cta: cta || undefined,
    footer: brand,
    quote: brief.title.trim() || FALLBACK_TAGLINE,
    attribution: brand,
    body: pain ? `Struggling with ${pain.toLowerCase().replace(/\.$/, '')}? You are not alone.` : undefined,
    items: shortLines(brief.useCases, 3),
    name: brand,
  };
}

function industryOrAudience(brief: BrandCanvasBrief): string | null {
  return firstLine([brief.industry, brief.audience]) ?? null;
}

/**
 * Compose ONE branded page for an empty canvas. Uses the curated archetypes
 * so the result inherits the studio's design language (contrast gates,
 * percent geometry, accessible pairings) instead of inventing new layout code.
 */
export function generateBrandCanvas(brief: BrandCanvasBrief, essentials: BrandEssentials): ContentDocPage[] {
  const size: ContentPageSizeId = defaultPageSizeForChannel(brief.contentType, brief.channel);
  const palette = brandEssentialsPalette(essentials);
  const copy = buildCopyBag(brief);
  const archetype = archetypeFor(brief);
  const socialSize = ['square', 'portrait', 'story'].includes(size);

  let spec;
  switch (archetype) {
    case 'quote':
      spec = quoteCard({ size, copy, options: { decor: (['marks', 'rule', 'blob'] as const)[briefSeedInt(brief.seed + ':d', 3)], align: socialSize ? 'center' : 'left' } });
      break;
    case 'promo':
      spec = storyPromo({ size, copy, options: { decor: (['circle', 'ring', 'wave', 'dots'] as const)[briefSeedInt(brief.seed + ':d', 4)] } });
      break;
    case 'list':
      spec = listiclePost({ size, copy, options: { itemCount: 3, marker: 'circle' } });
      break;
    default:
      spec = typePoster({ size, copy, options: { stack: 3, align: socialSize ? 'center' : 'left', decor: (['stripes', 'dots', 'none'] as const)[briefSeedInt(brief.seed + ':d', 3)] } });
  }

  // Bold layouts on dark gradients for story/square social formats, light
  // surface wash elsewhere — both derived from the scanned palette.
  const gradient = brandGradient(essentials, archetype === 'promo' || (archetype === 'poster' && socialSize) || (archetype === 'quote' && socialSize && briefSeedInt(brief.seed + ':g', 2) === 1));

  const page = buildTemplatePageSpec(
    { ...spec, gradient },
    0,
    `brand-canvas-${hashId(brief.seed).slice(0, 8)}`,
    palette,
    palette.accent,
  );
  return [page];
}

/** Page-size label for the confirm dialog copy. */
export function brandCanvasSizeLabel(brief: BrandCanvasBrief): string {
  const size = defaultPageSizeForChannel(brief.contentType, brief.channel);
  return CONTENT_PAGE_SIZES[size].label;
}
