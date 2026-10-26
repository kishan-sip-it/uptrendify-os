import { CONTENT_PAGE_SIZES, hashId, type ContentDocBlock, type ContentDocPage, type ContentDocument } from '@/lib/content/document';
import { contrastRatio, mixOver, relativeLuminance, requiredRatio } from '@/lib/studio/template-library/contrast';

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

export type LogoOutcome = 'added' | 'duplicate' | 'no-space' | 'limit' | 'off';

export type ApplyStats = {
  pagesThemed: number;
  pagesBackgroundPreserved: number;
  headingsStyled: number;
  bodiesStyled: number;
  shapesStyled: number;
  buttonsStyled: number;
  contrastFallbacks: number;
  imagesUntouched: number;
  logo: { pageIndex: number; outcome: LogoOutcome }[];
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
  return {
    colors,
    accent,
    secondary,
    ink,
    surface,
    headingFont: identity?.headingFont?.trim() || null,
    bodyFont: identity?.bodyFont?.trim() || null,
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

function blockBackground(page: ContentDocPage, block: ContentDocBlock): string {
  const ownBg = block.type === 'heading' || block.type === 'text' ? block.bg : null;
  return ownBg ?? page.bg ?? '#ffffff';
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
  const w = Math.max(72, Math.min(200, Math.round(168 * safeAspect)));
  const h = Math.max(32, Math.round(w / safeAspect));
  const candidates = [
    { x: dims.width - margin - w, y: margin },
    { x: margin, y: margin },
    { x: dims.width - margin - w, y: dims.height - margin - h },
    { x: margin, y: dims.height - margin - h },
  ];
  for (const candidate of candidates) {
    const rect = { ...candidate, w, h };
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > dims.width || rect.y + rect.h > dims.height) continue;
    const collides = page.blocks.some((block) => block.geometry ? rectsIntersect(rect, block.geometry) : false);
    if (!collides) return rect;
  }
  return null;
}

function themeRichText(
  runs: NonNullable<Extract<ContentDocBlock, { type: 'heading' | 'text' }>['richText']>,
  page: ContentDocPage,
  ink: string,
): { runs: typeof runs; fallbacks: number } {
  let fallbacks = 0;
  const themed = runs.map((run) => {
    const next = { ...run };
    if (typeof next.color === 'string' && next.color) {
      // Runs may sit on their own highlight; judge against it, else the page.
      const surface = next.bg ?? page.bg ?? '#ffffff';
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
    headingsStyled: 0,
    bodiesStyled: 0,
    shapesStyled: 0,
    buttonsStyled: 0,
    contrastFallbacks: 0,
    imagesUntouched: 0,
    logo: [],
  };
  const changedPageIds: string[] = [];

  const pages = doc.pages.map((page, pageIndex) => {
    const inScope = scope === 'document' || pageIndex === activePageIndex;
    if (!inScope) return page;

    // Preserve explicit user backgrounds (image/gradient) and user-picked solids.
    if (page.backgroundImage || page.gradient || page.bg) {
      stats.pagesBackgroundPreserved += 1;
    }

    let changed = false;
    // Content preservation ledger for this page.
    let blocks: ContentDocBlock[] = page.blocks.map((block, blockIndex) => {
      if (block.type === 'heading') {
        const next: ContentDocBlock = { ...block };
        const bg = blockBackground(page, block);
        const { color, fallbackUsed } = enforceReadable(essentials.ink, bg, block.fontSize, true, DEFAULT_INK);
        if (fallbackUsed) stats.contrastFallbacks += 1;
        if (color !== block.color) { next.color = color; changed = true; }
        if (essentials.headingFont && block.fontFamily !== essentials.headingFont) { next.fontFamily = essentials.headingFont; changed = true; }
        if (color !== block.color || (essentials.headingFont && block.fontFamily !== essentials.headingFont)) stats.headingsStyled += 1;
        if (block.richText?.length) {
          const { runs, fallbacks } = themeRichText(block.richText, page, color);
          if (fallbacks) stats.contrastFallbacks += fallbacks;
          next.richText = runs;
        }
        return next;
      }
      if (block.type === 'text') {
        const next: ContentDocBlock = { ...block };
        const bg = blockBackground(page, block);
        const { color, fallbackUsed } = enforceReadable(essentials.ink, bg, block.fontSize, block.bold, DEFAULT_INK);
        if (fallbackUsed) stats.contrastFallbacks += 1;
        if (color !== block.color) { next.color = color; changed = true; }
        if (essentials.bodyFont && block.fontFamily !== essentials.bodyFont) { next.fontFamily = essentials.bodyFont; changed = true; }
        if (color !== block.color || (essentials.bodyFont && block.fontFamily !== essentials.bodyFont)) stats.bodiesStyled += 1;
        if (block.richText?.length) {
          const { runs, fallbacks } = themeRichText(block.richText, page, color);
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
    if (!page.backgroundImage && !page.gradient && !page.bg && essentials.surface) {
      page = { ...page, bg: essentials.surface };
      changed = true;
    }

    // Logo layer: opt-in, deterministic id, non-overlapping placement only.
    if (includeLogo && logoSrc && essentials.logoUrl) {
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
      stats.logo.push({ pageIndex, outcome: 'no-space' });
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
