import { CONTENT_PAGE_SIZES, hashId, type ContentDocBlock, type ContentDocPage, type ContentDocument } from '@/lib/content/document';
import { contrastRatio, mixOver, relativeLuminance, requiredRatio } from '@/lib/studio/template-library/contrast';
import { resolveFontRoles } from '@/lib/brand/identity-mapping';

/**
 * Apply Brand Essentials — pure transformation core.
 *
 * Recolours and re-typesets an existing structured document from the scanned
 * brand identity WITHOUT touching content: text, links, geometry, element
 * ids, page order and sizes are preserved verbatim. Everything here is
 * deterministic, so applying the same brand twice converges (idempotent).
 * Contrast decisions use the shared WCAG helpers; combinations that cannot
 * pass are left untouched and reported instead of guessed.
 */

export const DEFAULT_INK = '#1d2634';

export type BrandEssentials = {
  /** Validated hex colours, primary first. */
  colors: string[];
  accent: string | null;
  secondary: string | null;
  /** Best dark text colour from the palette, or the theme default. */
  ink: string;
  /** Light surface candidate for page backgrounds, or null when none qualifies. */
  surface: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  logoUrl: string | null;
};

export type ApplyScope = 'page' | 'document';

export type LogoOutcome = 'added' | 'duplicate' | 'no-space' | 'limit' | 'off' | 'unavailable';

export type ApplyStats = {
  pagesThemed: number;
  pagesBackgroundPreserved: number;
  titlesStyled: number;
  headingsStyled: number;
  bodiesStyled: number;
  shapesStyled: number;
  buttonsStyled: number;
  contrastFallbacks: number;
  imagesUntouched: number;
  logo: { pageIndex: number; outcome: LogoOutcome; reason?: string }[];
  /** Set when the logo asset itself could not be fetched/validated/uploaded. */
  logoFailure: { reason: string } | null;
};

export type ApplyResult = {
  doc: ContentDocument;
  changedPageIds: string[];
  stats: ApplyStats;
};

const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

/** Distinct valid hex colours in order, capped to a sane palette size. */
function sanitizeColors(colors: unknown[]): string[] {
  const out: string[] = [];
  for (const color of colors) {
    if (isHex(color)) {
      const hex = color.toLowerCase();
      if (!out.includes(hex)) out.push(hex);
    }
  }
  return out.slice(0, 8);
}

/**
 * Resolve the applied essentials from a parsed visual identity. Missing or
 * malformed scan data degrades per-field: the caller receives whatever is
 * reliably available and renders partial-scope UI from it.
 */
export function resolveBrandEssentials(
  identity: {
    palette?: { hex: string; role: string }[] | null;
    primaryColor?: string | null;
    secondaryColors?: string[] | null;
    headingFont?: string | null;
    bodyFont?: string | null;
    fonts?: { family: string; evidence?: string }[] | null;
    logoUrl?: string | null;
  } | null,
  fallbackInk: string = DEFAULT_INK,
): BrandEssentials {
  const palette = (identity?.palette ?? []).filter((entry) => isHex(entry.hex)) as { hex: string; role: string }[];
  const ordered = sanitizeColors([
    identity?.primaryColor ?? null,
    ...palette.filter((entry) => entry.role === 'primary').map((entry) => entry.hex),
    ...(identity?.secondaryColors ?? []),
    ...palette.filter((entry) => entry.role === 'accent').map((entry) => entry.hex),
    ...palette.filter((entry) => entry.role === 'secondary').map((entry) => entry.hex),
    ...palette.map((entry) => entry.hex),
  ]);
  const colors = ordered.length > 0 ? ordered : sanitizeColors([...(identity?.secondaryColors ?? [])]);
  const accent = colors[0] ?? null;
  const secondary = colors[1] ?? null;
  const byLuminance = [...colors].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
  const ink = byLuminance.length > 0 && contrastRatio(byLuminance[0]!, '#ffffff') >= 7 ? byLuminance[0]! : fallbackInk;
  const surface = [...colors].sort((a, b) => relativeLuminance(b) - relativeLuminance(a)).find((color) => relativeLuminance(color) >= 0.84) ?? null;
  // Explicit scan roles win; otherwise derive from detected font evidence
  // using the existing identity-mapping helper. A detected family without
  // usable evidence still falls back to the first detected family only when
  // resolveFontRoles found one at all.
  const explicitHeading = identity?.headingFont?.trim() || null;
  const explicitBody = identity?.bodyFont?.trim() || null;
  const detected = resolveFontRoles(identity?.fonts ?? []);
  return {
    colors,
    accent,
    secondary,
    ink,
    surface,
    headingFont: explicitHeading ?? detected.headingFont,
    bodyFont: explicitBody ?? detected.bodyFont,
    logoUrl: identity?.logoUrl?.trim() || null,
  };
}

/** Button label colour that passes AA on the fill; falls back ink-ward, never guessing. */
export function contrastSafeLabel(fill: string, ink: string): string {
  const required = requiredRatio(18, true);
  if (contrastRatio('#ffffff', fill) >= required) return '#ffffff';
  if (contrastRatio(ink, fill) >= required) return ink;
  if (contrastRatio('#111111', fill) >= required) return '#111111';
  return ink;
}

function blockBackground(pageBgAfterApply: string, block: ContentDocBlock): string {
  const ownBg = block.type === 'heading' || block.type === 'text' ? block.bg : null;
  return ownBg ?? pageBgAfterApply;
}

function isReadable(fg: string, bg: string, fontSize: number | undefined, bold: boolean): boolean {
  return contrastRatio(fg, bg) >= requiredRatio(fontSize, bold);
}

/** Darken toward black until the pair passes AA (bounded steps; may still fail). */
function enforceReadable(fg: string, bg: string, fontSize: number | undefined, bold: boolean, fallback: string): { color: string; fallbackUsed: boolean } {
  if (isReadable(fg, bg, fontSize, bold)) return { color: fg, fallbackUsed: false };
  if (isReadable(fallback, bg, fontSize, bold)) return { color: fallback, fallbackUsed: true };
  for (const factor of [0.85, 0.7, 0.55, 0.4, 0.25]) {
    const candidate = mixOver(fg, '#000000', factor);
    if (isReadable(candidate, bg, fontSize, bold)) return { color: candidate, fallbackUsed: true };
  }
  return { color: fg, fallbackUsed: false };
}

const LADDER_FACTORS = [0.85, 0.7, 0.55, 0.4, 0.25];

/**
 * Every shade the accent ladder can produce for these palette colours. The
 * brand lint must accept these derived brand shades as on-brand, exactly like
 * the colours they are darkened from.
 */
export function brandAccentLadderShades(colors: string[]): string[] {
  const out: string[] = [];
  for (const color of colors) {
    if (!isHex(color)) continue;
    for (const factor of LADDER_FACTORS) out.push(mixOver(color.toLowerCase(), '#000000', factor));
  }
  return out;
}

/**
 * Darken an accent toward black only as far as AA requires. Unlike
 * `enforceReadable`, this keeps a mid-tone brand accent visibly branded on
 * light backgrounds instead of jumping straight to the ink fallback.
 * Returns null when no darkened step reads, so the caller can fall back.
 */
function darkenUntilReadable(fg: string, bg: string, fontSize: number | undefined, bold: boolean): string | null {
  if (isReadable(fg, bg, fontSize, bold)) return fg;
  for (const factor of [0.85, 0.7, 0.55, 0.4, 0.25]) {
    const candidate = mixOver(fg, '#000000', factor);
    if (isReadable(candidate, bg, fontSize, bold)) return candidate;
  }
  return null;
}

/**
 * Brand-derived body ink: the darkest palette colour that passes AA against
 * this page's own background, so ordinary body copy visibly takes the brand
 * where the data supports it. Falls back through the resolved ink ladder.
 */
function bodyInkForBackground(bg: string, essentials: BrandEssentials, fontSize: number | undefined, bold: boolean): string {
  const byLuminance = [...essentials.colors].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
  for (const color of byLuminance) {
    if (isReadable(color, bg, fontSize, bold)) return color;
  }
  return enforceReadable(essentials.ink, bg, fontSize, bold, DEFAULT_INK).color;
}

/**
 * Infer a likely title/lead block among ordinary text blocks. Typography
 * metadata decides first (a clearly larger size than the page's median body
 * size); without that evidence, a short block high on a multi-block page can
 * qualify via geometry. Never blindly assumes the first text block, and
 * returns null when the evidence is uniform or too thin.
 */
export function inferTitleBlockId(blocks: ContentDocBlock[], pageHeight?: number): string | null {
  const texts = blocks.filter((block): block is Extract<ContentDocBlock, { type: 'text' }> => block.type === 'text' && !block.hidden);
  if (texts.length < 3) return null;
  const candidates = texts.filter((block) => {
    const length = block.text.trim().length;
    return length >= 3 && length <= 140;
  });
  if (!candidates.length) return null;
  const topmost = (pool: typeof candidates): string =>
    pool.reduce((best, block) => {
      const bestY = best.geometry?.y ?? Number.POSITIVE_INFINITY;
      const blockY = block.geometry?.y ?? Number.POSITIVE_INFINITY;
      if (blockY < bestY) return block;
      if (blockY === bestY && blocks.indexOf(block) < blocks.indexOf(best)) return block;
      return best;
    }).id;
  const sized = texts.filter((block) => (block.fontSize ?? 0) > 0);
  if (sized.length >= 2) {
    const sortedSizes = sized.map((block) => block.fontSize!).sort((a, b) => a - b);
    const median = sortedSizes[Math.floor(sortedSizes.length / 2)]!;
    const larger = candidates.filter((block) => (block.fontSize ?? 0) >= Math.max(18, median * 1.3));
    if (larger.length) return topmost(larger);
  }
  if (pageHeight && candidates.length >= 3) {
    const upper = candidates.filter((block) => block.geometry && block.geometry.y + block.geometry.h <= pageHeight * 0.5);
    if (upper.length) return topmost(upper);
  }
  return null;
}

/**
 * Geometry for a logo dropped at a canvas point: centred on the drop
 * coordinates, aspect-preserving, clamped inside the page. Screen→page
 * conversion happens in the caller; this is pure page-space math.
 */
export function logoDropRect(
  drop: { x: number; y: number },
  logoAspect: number,
  page: { width: number; height: number },
  existingRects: { x: number; y: number; w: number; h: number }[] = [],
): { x: number; y: number; w: number; h: number } {
  const safeAspect = Number.isFinite(logoAspect) && logoAspect > 0 ? Math.min(4, Math.max(0.4, logoAspect)) : 2;
  const w = Math.max(64, Math.min(220, Math.round(150 * Math.max(0.6, Math.min(1.8, safeAspect / 2)))));
  const h = Math.max(30, Math.round(w / safeAspect));
  const within = (value: number, max: number, size: number) => Math.max(8, Math.min(max - size - 8, value));
  let x = Math.round(within(drop.x - w / 2, page.width, w));
  let y = Math.round(within(drop.y - h / 2, page.height, h));
  // Nudge up to a few px if the exact centre overlaps something; never move
  // existing content — if every nudge collides, keep the in-bounds position
  // (z-order puts the logo on top; it remains fully user-movable).
  const collides = (rect: { x: number; y: number; w: number; h: number }) => existingRects.some((other) => rectsOverlap(rect, other));
  if (collides({ x, y, w, h })) {
    const nudges: Array<[number, number]> = [[0, -8], [0, 8], [-8, 0], [8, 0], [0, -16], [0, 16], [-16, 0], [16, 0]];
    for (const [dx, dy] of nudges) {
      const candidate = { x: Math.round(within(x + dx, page.width, w)), y: Math.round(within(y + dy, page.height, h)), w, h };
      if (!collides(candidate)) { x = candidate.x; y = candidate.y; break; }
    }
  }
  return { x, y, w, h };
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Stable logo layer id per page — repeats converge instead of duplicating. */
export function brandLogoBlockId(pageId: string): string {
  return `brand-logo-${hashId(pageId)}`;
}

const BREATHING = 12;

function rectsIntersect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad = BREATHING): boolean {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

/**
 * Deterministic placement search for a brand logo layer. Candidate anchors are
 * the four page corners (inside a 40px margin); the first slot that fits and
 * does not touch any existing element wins. Never moves existing content.
 * `logoAspect` is width/height from the loaded logo image.
 */
export function planLogoPlacement(page: ContentDocPage, logoAspect: number, margin = 40): { x: number; y: number; w: number; h: number } | null {
  const dims = CONTENT_PAGE_SIZES[page.size ?? 'a4'];
  if (page.blocks.length >= 40) return null;
  const safeAspect = Number.isFinite(logoAspect) && logoAspect > 0 ? Math.min(4, Math.max(0.4, logoAspect)) : 2;
  const solid = page.blocks.filter((block) => !block.hidden && block.geometry);
  // Width variants keep the logo usable when only a narrow band is free.
  const widths = [168, 126, 92].map((base) => Math.max(64, Math.round(base * Math.min(1.4, Math.max(0.6, safeAspect / 2)))));
  const heights = widths.map((width) => Math.max(30, Math.round(width / safeAspect)));
  for (let variant = 0; variant < widths.length; variant += 1) {
    const w = widths[variant]!;
    const h = heights[variant]!;
    // Horizontal band scan top→bottom finds gaps between stacked text boxes
    // that fixed corners miss; right first (reading-end anchor), then left.
    for (let y = margin; y + h <= dims.height - margin; y += 24) {
      for (const x of [dims.width - margin - w, margin]) {
        const rect = { x, y, w, h };
        const collides = solid.some((block) => rectsIntersect(rect, block.geometry!));
        if (!collides) return rect;
      }
    }
  }
  return null;
}

function themeRichText(
  runs: NonNullable<Extract<ContentDocBlock, { type: 'heading' | 'text' }>['richText']>,
  pageBg: string,
  ink: string,
): { runs: typeof runs; fallbacks: number } {
  let fallbacks = 0;
  const themed = runs.map((run) => {
    const next = { ...run };
    if (typeof next.color === 'string' && next.color) {
      // Runs may sit on their own highlight; judge against it, else the page.
      const surface = next.bg ?? pageBg;
      if (!isReadable(next.color, surface, next.fontSize, next.bold ?? false)) {
        next.color = ink;
        fallbacks += 1;
      }
    }
    return next;
  });
  return { runs: themed, fallbacks };
}

export type ApplyOptions = {
  doc: ContentDocument;
  essentials: BrandEssentials;
  scope: ApplyScope;
  activePageIndex: number;
  /** Managed (already-validated) logo src; logo layers are only added when set. */
  logoSrc?: string | null;
  logoAspect?: number;
  includeLogo: boolean;
  /** Set when the logo asset could not be fetched/validated/uploaded. */
  logoFailure?: { reason: string } | null;
};

/**
 * Apply the brand essentials. Pure: returns a new document, mutates nothing.
 * Preserves all copy, links, geometry, ids, page order/sizes and imagery.
 */
export function applyBrandEssentials(options: ApplyOptions): ApplyResult {
  const { doc, essentials, scope, activePageIndex, logoSrc, logoAspect, includeLogo } = options;
  const stats: ApplyStats = {
    pagesThemed: 0,
    pagesBackgroundPreserved: 0,
    titlesStyled: 0,
    headingsStyled: 0,
    bodiesStyled: 0,
    shapesStyled: 0,
    buttonsStyled: 0,
    contrastFallbacks: 0,
    imagesUntouched: 0,
    logo: [],
    logoFailure: options.logoFailure ?? null,
  };
  const changedPageIds: string[] = [];

  const pages = doc.pages.map((page, pageIndex) => {
    const inScope = scope === 'document' || pageIndex === activePageIndex;
    if (!inScope) return page;

    // The background the page will have AFTER this pass — text is themed
    // against it so back-to-back applications converge (no colour flip-flop).
    const pageBgAfterApply = page.backgroundImage
      ? (page.bg ?? '#ffffff')
      : page.gradient
        ? mixOver(page.gradient.from, page.gradient.to, 0.5)
        : (page.bg ?? essentials.surface ?? (essentials.accent ? mixOver(essentials.accent, '#ffffff', 0.08) : '#ffffff'));

    // Preserve explicit user backgrounds (image/gradient) and user-picked solids.
    if (page.backgroundImage || page.gradient || page.bg) {
      stats.pagesBackgroundPreserved += 1;
    }

    let changed = false;
    const titleBlockId = inferTitleBlockId(page.blocks, CONTENT_PAGE_SIZES[page.size ?? 'a4'].height);
    // Content preservation ledger for this page.
    let blocks: ContentDocBlock[] = page.blocks.map((block, blockIndex) => {
      if (block.type === 'heading') {
        const next: ContentDocBlock = { ...block };
        const bg = blockBackground(pageBgAfterApply, block);
        // Headings carry the brand: the accent ladder darkens only as far as
        // AA requires, keeping mid-tone accents visible; ink is the fallback.
        const accentHeading = essentials.accent
          ? darkenUntilReadable(essentials.accent, bg, block.fontSize, true)
          : null;
        const headingColor = accentHeading ?? enforceReadable(essentials.ink, bg, block.fontSize, true, DEFAULT_INK).color;
        if (accentHeading === null && essentials.accent) stats.contrastFallbacks += 1;
        if (headingColor !== block.color) { next.color = headingColor; changed = true; }
        if (essentials.headingFont && block.fontFamily !== essentials.headingFont) { next.fontFamily = essentials.headingFont; changed = true; }
        if (headingColor !== block.color || (essentials.headingFont && block.fontFamily !== essentials.headingFont)) stats.headingsStyled += 1;
        if (block.richText?.length) {
          const { runs, fallbacks } = themeRichText(block.richText, pageBgAfterApply, headingColor);
          if (fallbacks) stats.contrastFallbacks += fallbacks;
          next.richText = runs;
        }
        return next;
      }
      if (block.type === 'text') {
        const next: ContentDocBlock = { ...block };
        const bg = blockBackground(pageBgAfterApply, block);
        const isTitle = block.id === titleBlockId;
        // Bold short lines are labels/eyebrows and a reliable title/lead takes
        // the heading treatment — both use the readable accent ladder. Body
        // copy gets the darkest palette ink that reads on this page, so
        // text-heavy pages visibly take the brand without touching copy.
        const isLabel = !isTitle && Boolean(block.bold) && block.text.trim().length > 0 && block.text.trim().length <= 80;
        let chosenColor: string;
        let usedFallback = false;
        if (isTitle || isLabel) {
          const accentColor = essentials.accent ? darkenUntilReadable(essentials.accent, bg, block.fontSize, true) : null;
          if (accentColor) {
            chosenColor = accentColor;
          } else {
            chosenColor = enforceReadable(essentials.ink, bg, block.fontSize, true, DEFAULT_INK).color;
            usedFallback = true;
          }
        } else {
          chosenColor = bodyInkForBackground(bg, essentials, block.fontSize, Boolean(block.bold));
        }
        if (usedFallback) stats.contrastFallbacks += 1;
        const titleEmphasis = isTitle && !block.bold;
        if (chosenColor !== block.color) { next.color = chosenColor; changed = true; }
        if (isTitle && essentials.headingFont && block.fontFamily !== essentials.headingFont) { next.fontFamily = essentials.headingFont; changed = true; }
        if (titleEmphasis) { next.bold = true; changed = true; }
        if (!isTitle && essentials.bodyFont && block.fontFamily !== essentials.bodyFont) { next.fontFamily = essentials.bodyFont; changed = true; }
        if (isTitle) {
          if (chosenColor !== block.color || titleEmphasis || (essentials.headingFont && block.fontFamily !== essentials.headingFont)) stats.titlesStyled += 1;
        } else if (chosenColor !== block.color || (essentials.bodyFont && block.fontFamily !== essentials.bodyFont)) stats.bodiesStyled += 1;
        if (block.richText?.length) {
          const { runs, fallbacks } = themeRichText(block.richText, pageBgAfterApply, chosenColor);
          if (fallbacks) stats.contrastFallbacks += fallbacks;
          next.richText = runs;
        }
        return next;
      }
      if (block.type === 'shape') {
        const role = blockIndex % 2 === 0 ? essentials.accent : (essentials.secondary ?? essentials.accent);
        if (role && block.color !== role) {
          stats.shapesStyled += 1;
          changed = true;
          return { ...block, color: role };
        }
        return block;
      }
      if (block.type === 'button') {
        const fill = essentials.accent ?? block.color ?? '#2563eb';
        const label = contrastSafeLabel(fill, essentials.ink);
        if (block.color !== fill || block.textColor !== label) {
          stats.buttonsStyled += 1;
          changed = true;
          return { ...block, color: fill, textColor: label };
        }
        return block;
      }
      if (block.type === 'image') stats.imagesUntouched += 1;
      return block;
    });

    // Page background: only when the page has no explicit user-set background.
    // A light brand tint (accent washed toward white) keeps AA trivially safe
    // while making text-heavy pages visibly take the brand.
    if (!page.backgroundImage && !page.gradient && !page.bg) {
      const surface = essentials.surface ?? (essentials.accent ? mixOver(essentials.accent, '#ffffff', 0.08) : null);
      if (surface && surface.toLowerCase() !== '#ffffff') {
        page = { ...page, bg: surface };
        changed = true;
      }
    }

    // Logo layer: opt-in, deterministic id, non-overlapping placement only.
    if (includeLogo && stats.logoFailure) {
      stats.logo.push({ pageIndex, outcome: 'unavailable', reason: stats.logoFailure.reason });
    } else if (includeLogo && logoSrc && essentials.logoUrl) {
      const logoId = brandLogoBlockId(page.id);
      if (blocks.some((block) => block.id === logoId)) {
        stats.logo.push({ pageIndex, outcome: 'duplicate' });
      } else if (blocks.length >= 40) {
        stats.logo.push({ pageIndex, outcome: 'limit' });
      } else {
        const aspect = logoAspect && logoAspect > 0 ? logoAspect : 2;
        const placement = planLogoPlacement({ ...page, blocks }, aspect);
        if (!placement) {
          stats.logo.push({ pageIndex, outcome: 'no-space' });
        } else {
          blocks = [...blocks, {
            id: logoId,
            type: 'image' as const,
            url: logoSrc,
            alt: 'Brand logo',
            align: 'left' as const,
            width: 100,
            geometry: placement,
          }];
          stats.logo.push({ pageIndex, outcome: 'added' });
          changed = true;
        }
      }
    } else if (includeLogo && !logoSrc && essentials.logoUrl) {
      stats.logo.push({ pageIndex, outcome: 'unavailable', reason: 'The brand logo asset was not imported.' });
    }

    if (changed) {
      stats.pagesThemed += 1;
      changedPageIds.push(page.id);
      return { ...page, blocks };
    }
    return page;
  });

  return {
    doc: { ...doc, pages },
    changedPageIds,
    stats,
  };
}
