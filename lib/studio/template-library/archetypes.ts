import { CONTENT_PAGE_SIZES, type ContentPageSizeId } from '@/lib/content/document';
import type { TemplateBlockSpec, TemplatePageSpec } from './types';

/**
 * Curated layout archetypes. Each composer turns a copy bag + composition
 * options into real page geometry, so catalogue entries stay terse while the
 * actual compositions differ structurally (element counts, positions, formats).
 *
 * Geometry is authored in percentages of the page and converted per size, with
 * a width-relative font scale — the same design language across formats.
 */

export type CopyBag = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  cta?: string;
  footer?: string;
  quote?: string;
  attribution?: string;
  items?: string[];
  stats?: Array<{ value: string; label: string }>;
  contact?: string;
  price?: string;
  badge?: string;
  date?: string;
  location?: string;
  name?: string;
  role?: string;
};

type Dims = { width: number; height: number };
type Geo = { x: number; y: number; w: number; h: number; rotation?: number };
type ShapeKind = 'rectangle' | 'square' | 'circle' | 'triangle' | 'star' | 'pyramid';
type FontKey = 'sans' | 'display' | 'geometric' | 'humanist';

const pageDims = (size: ContentPageSizeId): Dims => CONTENT_PAGE_SIZES[size];

/** Percent geometry → page pixels, honouring the 24px minimum element size. */
function g(d: Dims, nx: number, ny: number, nw: number, nh: number, rotation?: number): Geo {
  const spec: Geo = {
    x: Math.round((d.width * nx) / 100),
    y: Math.round((d.height * ny) / 100),
    w: Math.max(24, Math.round((d.width * nw) / 100)),
    h: Math.max(24, Math.round((d.height * nh) / 100)),
  };
  if (rotation) spec.rotation = rotation;
  return spec;
}

/** Width-relative font size: 760px-wide pages are the reference scale. */
function fs(d: Dims, base: number): number {
  return Math.max(8, Math.min(160, Math.round(base * Math.max(0.85, Math.min(1.7, d.width / 760)))));
}

function t(kind: 'heading' | 'text', text: string | undefined, geo: Geo, options: Partial<{ fontSize: number; level: 1 | 2 | 3; align: 'left' | 'center' | 'right'; bg: string; bold: boolean; italic: boolean; underline: boolean; font: FontKey; opacity: number; color: string }> = {}): TemplateBlockSpec {
  return { kind, text: typeof text === 'string' ? text : '', ...geo, ...options } as TemplateBlockSpec;
}
function s(geo: Geo, options: Partial<{ shape: ShapeKind; art: string; artStroke: boolean; color: string; opacity: number }> = {}): TemplateBlockSpec {
  return { kind: 'shape', ...geo, ...options } as TemplateBlockSpec;
}
function btn(text: string, geo: Geo, options: Partial<{ color: string; align: 'left' | 'center' | 'right'; opacity: number }> = {}): TemplateBlockSpec {
  return { kind: 'button', text, ...geo, ...options } as TemplateBlockSpec;
}

export type ArchetypeArgs<P> = { size: ContentPageSizeId; copy: CopyBag; options?: P };
/** A composer renders ONE curated page; catalogue entries stitch pages together. */
export type Composer<P = void> = (args: ArchetypeArgs<P>) => TemplatePageSpec;

function page(size: ContentPageSizeId, blocks: TemplateBlockSpec[], bg?: string): TemplatePageSpec {
  return { size, ...(bg ? { bg } : {}), blocks };
}

const ALIGN_X = { left: 8, center: 15, right: 8 } as const;

/** Eyebrow chip (soft pill with small caps text). Shared helper. */
function eyebrowChip(d: Dims, text: string, align: 'left' | 'center', y = 7): TemplateBlockSpec[] {
  if (!text) return [];
  const w = align === 'center' ? 46 : 40;
  const x = align === 'center' ? 27 : 8;
  return [
    s(g(d, x, y, w, 5.2), { shape: 'rectangle', color: 'accent', opacity: 0.14 }),
    t('text', text.toUpperCase(), g(d, x + 1.5, y + 0.6, w - 3, 4), { fontSize: fs(d, 15), align: 'center', color: 'accent', bold: true }),
  ];
}

/** Framed "drop your image here" placeholder: soft panel + icon + caption. */
function photoPlaceholder(d: Dims, nx: number, ny: number, nw: number, nh: number, label = 'Drop your photo here', color: 'soft' | 'accent' | string = 'soft', opacity?: number): TemplateBlockSpec[] {
  return [
    s(g(d, nx, ny, nw, nh), { shape: 'rectangle', color, opacity: opacity ?? 0.55 }),
    s(g(d, nx + nw / 2 - 6, ny + nh / 2 - 6, 12, 12), { art: 'image', artStroke: true, color: 'ink', opacity: 0.6 }),
    t('text', label, g(d, nx + 2, ny + nh / 2 + 6, nw - 4, 6), { fontSize: fs(d, 15), align: 'center', color: 'ink', opacity: 0.6 }),
  ];
}

// ---------------------------------------------------------------------------
// Composers. Every one is original and produces distinct structure.
// ---------------------------------------------------------------------------

/** 01 — Quote card: oversized quotation, optional eyebrow, decor variants. */
export const quoteCard: Composer<{ decor?: 'rule' | 'blob' | 'marks' | 'none'; align?: 'left' | 'center' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const align = options?.align ?? 'left';
  const decor = options?.decor ?? 'rule';
  const blocks: TemplateBlockSpec[] = [];
  if (decor === 'blob') blocks.push(s(g(d, align === 'center' ? 18 : -14, 58, 70, 46), { art: 'blob-soft', color: 'soft', opacity: 0.9 }));
  if (decor === 'marks') blocks.push(t('heading', '“', g(d, align === 'center' ? 30 : 6, 8, 30, 18), { fontSize: fs(d, 130), align, color: 'accent', font: 'display' }));
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? '', align === 'center' ? 'center' : 'left', 8));
  const quoteY = decor === 'marks' ? 24 : 20;
  blocks.push(t('heading', copy.quote ?? copy.title, g(d, ALIGN_X[align], quoteY, align === 'center' ? 70 : 84, 38), { fontSize: fs(d, 52), align, color: 'ink', font: 'display', level: 1 }));
  blocks.push(s(g(d, align === 'center' ? 42 : 8, 66, align === 'center' ? 16 : 12, 1.6), { shape: 'rectangle', color: 'accent' }));
  blocks.push(t('text', copy.attribution ?? copy.footer ?? '', g(d, ALIGN_X[align], 72, align === 'center' ? 70 : 84, 6), { fontSize: fs(d, 19), align, color: 'ink', italic: true, opacity: 0.8 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, align === 'center' ? 30 : 8, 84, 40, 7.5), { color: 'accent' }));
  return page(size, blocks);
};

/** 02 — Bold typographic poster: giant stacked title, footer strip. */
export const typePoster: Composer<{ stack?: 2 | 3; align?: 'left' | 'center'; decor?: 'stripes' | 'dots' | 'none' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const align = options?.align ?? 'left';
  const stack = options?.stack ?? 3;
  const decor = options?.decor ?? 'none';
  const blocks: TemplateBlockSpec[] = [];
  if (decor === 'stripes') blocks.push(s(g(d, 62, 0, 38, 30), { art: 'stripes', color: 'accent', opacity: 0.5 }));
  if (decor === 'dots') blocks.push(s(g(d, 68, 6, 24, 24), { art: 'dots', color: 'accent', opacity: 0.6 }));
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? '', align, 8));
  blocks.push(t('heading', copy.title, g(d, ALIGN_X[align], 16, align === 'center' ? 84 : 84, stack === 3 ? 34 : 26), { fontSize: fs(d, stack === 3 ? 88 : 96), align, color: 'ink', font: 'geometric', level: 1 }));
  if (copy.subtitle) blocks.push(t('text', copy.subtitle, g(d, ALIGN_X[align], 52, align === 'center' ? 70 : 62, 12), { fontSize: fs(d, 22), align, color: 'ink', opacity: 0.75 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, align === 'center' ? 30 : 8, 70, 40, 7.5), { color: 'accent' }));
  blocks.push(s(g(d, 0, 88, 100, 12), { shape: 'rectangle', color: 'accent', opacity: 0.12 }));
  blocks.push(t('text', copy.footer ?? '', g(d, 8, 90, 84, 6), { fontSize: fs(d, 15), align, color: 'ink', bold: true }));
  return page(size, blocks);
};

/** 03 — Product feature: photo placeholder + heading + copy + CTA. */
export const productFeature: Composer<{ placeholderShape?: 'panel' | 'circle' | 'arch'; ctaAlign?: 'left' | 'center' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const shape = options?.placeholderShape ?? 'panel';
  const blocks: TemplateBlockSpec[] = [];
  if (shape === 'panel') blocks.push(...photoPlaceholder(d, 8, 7, 84, 38));
  if (shape === 'circle') blocks.push(...photoPlaceholder(d, 25, 5, 50, 34, copy.badge || 'Drop your photo here', 'soft'), s(g(d, 25, 5, 50, 34), { shape: 'circle', color: 'accent', opacity: 0.16 }));
  if (shape === 'arch') {
    blocks.push(s(g(d, 8, 6, 84, 40), { shape: 'rectangle', color: 'soft', opacity: 0.6 }));
    blocks.push(s(g(d, 32, 6, 36, 40), { shape: 'rectangle', color: 'accent', opacity: 0.2 }));
    blocks.push(t('text', copy.badge ?? 'Drop your photo here', g(d, 32, 24, 36, 6), { fontSize: fs(d, 15), align: 'center', color: 'ink', opacity: 0.6 }));
  }
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? '', 'left', 52));
  blocks.push(t('heading', copy.title, g(d, 8, 58, 84, 12), { fontSize: fs(d, 40), align: 'left', color: 'ink', level: 2 }));
  if (copy.body) blocks.push(t('text', copy.body, g(d, 8, 71, 84, 10), { fontSize: fs(d, 19), align: 'left', color: 'ink', opacity: 0.8 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 8, 84, 38, 7.5), { color: 'accent' }));
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 8, 93, 84, 4), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 04 — Story promo: full-bleed circle, stacked copy, CTA. */
export const storyPromo: Composer<{ decor?: 'circle' | 'arc' | 'ring' | 'wave' | 'corner' | 'dots' | 'stripes' | 'arcBottom'; badgeTop?: boolean }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const decor = options?.decor ?? 'circle';
  const blocks: TemplateBlockSpec[] = [];
  if (decor === 'circle') blocks.push(s(g(d, 12, 22, 76, 40), { shape: 'circle', color: 'accent', opacity: 0.85 }));
  if (decor === 'arc') blocks.push(s(g(d, -20, 16, 140, 52), { art: 'half-disc', color: 'accent', opacity: 0.85 }));
  if (decor === 'ring') blocks.push(s(g(d, 14, 20, 72, 44), { art: 'ring', color: 'accent', opacity: 0.8 }));
  if (decor === 'wave') blocks.push(s(g(d, 0, 8, 100, 12), { art: 'wave', color: 'accent', opacity: 0.5 }));
  if (decor === 'corner') blocks.push(s(g(d, -16, -16, 52, 52), { art: 'quarter-arc', color: 'accent', opacity: 0.9 }));
  if (decor === 'dots') blocks.push(s(g(d, 70, 6, 22, 22), { art: 'dots', color: 'accent', opacity: 0.6 }));
  if (decor === 'stripes') blocks.push(s(g(d, 58, 2, 42, 18), { art: 'stripes', color: 'accent', opacity: 0.4 }));
  if (decor === 'arcBottom') blocks.push(s(g(d, -20, 68, 140, 52), { art: 'half-disc', color: 'accent', opacity: 0.85 }));
  if (options?.badgeTop && copy.badge) {
    blocks.push(s(g(d, 32, 5, 36, 6), { art: 'badge-flag', color: 'ink' }));
    blocks.push(t('text', copy.badge, g(d, 32, 6, 36, 4), { fontSize: fs(d, 15), align: 'center', color: 'paper', bold: true }));
  }
  blocks.push(t('heading', copy.title, g(d, 10, 42, 80, 16), { fontSize: fs(d, 56), align: 'center', color: 'ink', level: 1, font: 'geometric' }));
  if (copy.subtitle) blocks.push(t('text', copy.subtitle, g(d, 14, 60, 72, 12), { fontSize: fs(d, 21), align: 'center', color: 'ink', opacity: 0.8 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 28, 76, 44, 6.5), { color: 'accent' }));
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 14, 88, 72, 4), { fontSize: fs(d, 14), align: 'center', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 05 — Listicle: numbered items with dot markers. */
export const listiclePost: Composer<{ itemCount?: 3 | 4 | 5; marker?: 'circle' | 'square' | 'pin' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const count = options?.itemCount ?? 4;
  const marker = options?.marker ?? 'circle';
  const items = (copy.items ?? []).slice(0, count);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? '', 'left', 6));
  blocks.push(t('heading', copy.title, g(d, 8, 13, 84, 12), { fontSize: fs(d, 42), align: 'left', color: 'ink', level: 2 }));
  const top = 30;
  const step = (92 - top - 2) / count;
  items.forEach((item, index) => {
    const y = top + index * step;
    blocks.push(s(g(d, 8, y, 9, step * 0.62), marker === 'circle' ? { shape: 'circle', color: 'accent' } : marker === 'square' ? { shape: 'square', color: 'accent' } : { art: 'pin', artStroke: true, color: 'accent' }));
    if (marker !== 'pin') blocks.push(t('heading', String(index + 1), g(d, 8, y + step * 0.08, 9, step * 0.46), { fontSize: fs(d, 22), align: 'center', color: 'paper', level: 3 }));
    blocks.push(t('text', item, g(d, 20, y, 72, step * 0.72), { fontSize: fs(d, 19), align: 'left', color: 'ink', bold: true }));
  });
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 8, 93, 84, 4), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 06 — Testimonial: quote, avatar disc, stars, name/role. */
export const testimonialCard: Composer<{ stars?: 4 | 5; decor?: 'panel' | 'quote-mark' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const stars = options?.stars ?? 5;
  const blocks: TemplateBlockSpec[] = [];
  if (options?.decor === 'panel') blocks.push(s(g(d, 6, 8, 88, 84), { shape: 'rectangle', color: 'soft', opacity: 0.7 }));
  else blocks.push(t('heading', '“', g(d, 8, 6, 20, 14), { fontSize: fs(d, 120), align: 'left', color: 'accent', font: 'display' }));
  blocks.push(t('heading', copy.quote ?? copy.title, g(d, 12, 20, 76, 30), { fontSize: fs(d, 34), align: 'left', color: 'ink', font: 'display', level: 2 }));
  blocks.push(...Array.from({ length: stars }, (_, index) => s(g(d, 12 + index * 9, 56, 7, 7), { art: 'star', artStroke: true, color: 'accent' })));
  blocks.push(s(g(d, 12, 68, 11, 11), { shape: 'circle', color: 'accent', opacity: 0.85 }));
  blocks.push(t('text', copy.attribution ?? copy.name ?? '', g(d, 26, 68, 60, 5), { fontSize: fs(d, 19), align: 'left', color: 'ink', bold: true }));
  blocks.push(t('text', copy.role ?? copy.footer ?? '', g(d, 26, 74, 60, 4), { fontSize: fs(d, 15), align: 'left', color: 'ink', opacity: 0.7 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 12, 85, 34, 7), { color: 'accent' }));
  return page(size, blocks);
};

/** 07 — Poll / this-or-that: question + option pills. */
export const pollPost: Composer<{ optionCount?: 2 | 3 | 4 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const count = options?.optionCount ?? 2;
  const items = (copy.items ?? []).slice(0, count);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? 'Community poll', 'center', 7));
  blocks.push(t('heading', copy.title, g(d, 10, 15, 80, 14), { fontSize: fs(d, 46), align: 'center', color: 'ink', level: 1 }));
  const top = 36;
  const gap = 3.5;
  const step = Math.min(14, (94 - top - gap * count) / count);
  items.forEach((item, index) => {
    const y = top + index * (step + gap);
    blocks.push(s(g(d, 12, y, 76, step), { shape: 'rectangle', color: index % 2 === 0 ? 'accent' : 'soft', opacity: index % 2 === 0 ? 0.14 : 1 }));
    blocks.push(t('text', item, g(d, 15, y + step * 0.18, 70, step * 0.6), { fontSize: fs(d, 22), align: 'center', color: 'ink', bold: true }));
  });
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 12, 92, 76, 4), { fontSize: fs(d, 15), align: 'center', color: 'ink', opacity: 0.65 }));
  return page(size, blocks);
};

/** 08 — Carousel cover: big index badge + swipe hint. */
export const carouselCover: Composer<{ swipeHint?: boolean }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(s(g(d, -16, -16, 52, 52), { art: 'quarter-arc', color: 'accent', opacity: 0.9 }));
  blocks.push(t('text', copy.badge ?? '1', g(d, 7, 6, 10, 5), { fontSize: fs(d, 18), align: 'center', color: 'paper', bold: true }));
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? '', 'left', 28));
  blocks.push(t('heading', copy.title, g(d, 8, 35, 84, 24), { fontSize: fs(d, 72), align: 'left', color: 'ink', level: 1, font: 'geometric' }));
  if (copy.subtitle) blocks.push(t('text', copy.subtitle, g(d, 8, 62, 70, 10), { fontSize: fs(d, 21), align: 'left', color: 'ink', opacity: 0.75 }));
  blocks.push(s(g(d, 8, 88, 84, 1.2), { shape: 'rectangle', color: 'accent' }));
  if (options?.swipeHint !== false) blocks.push(t('text', copy.footer ?? 'Swipe →', g(d, 8, 91, 84, 4), { fontSize: fs(d, 15), align: 'left', color: 'ink', bold: true }));
  return page(size, blocks);
};

/** 09 — Carousel tip page: step number rail + body. */
export const carouselTip: Composer<{ step?: string }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(s(g(d, 8, 8, 13, 7), { shape: 'rectangle', color: 'accent' }));
  blocks.push(t('heading', options?.step ?? copy.badge ?? '1', g(d, 8, 8.6, 13, 5), { fontSize: fs(d, 24), align: 'center', color: 'paper', level: 3 }));
  blocks.push(t('heading', copy.title, g(d, 8, 20, 84, 14), { fontSize: fs(d, 48), align: 'left', color: 'ink', level: 2 }));
  if (copy.body) blocks.push(t('text', copy.body, g(d, 8, 38, 84, 22), { fontSize: fs(d, 22), align: 'left', color: 'ink' }));
  if (copy.items?.length) {
    copy.items.slice(0, 3).forEach((item, index) => {
      blocks.push(s(g(d, 8, 64 + index * 8, 3.5, 3.5), { shape: 'circle', color: 'accent' }));
      blocks.push(t('text', item, g(d, 14, 64 + index * 8 - 0.6, 78, 5), { fontSize: fs(d, 17), align: 'left', color: 'ink', opacity: 0.85 }));
    });
  }
  blocks.push(s(g(d, 8, 92, 84, 1.2), { shape: 'rectangle', color: 'soft' }));
  blocks.push(t('text', copy.footer ?? '', g(d, 8, 94, 84, 4), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 10 — Before/after split. */
export const beforeAfter: Composer<{ labels?: [string, string]; splitStyle?: 'vertical' | 'horizontal' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const [beforeLabel, afterLabel] = options?.labels ?? ['Before', 'After'];
  const blocks: TemplateBlockSpec[] = options?.splitStyle === 'horizontal'
    ? [
        s(g(d, 6, 20, 88, 26), { shape: 'rectangle', color: 'soft' }),
        s(g(d, 6, 50, 88, 26), { shape: 'rectangle', color: 'accent', opacity: 0.2 }),
        t('text', beforeLabel, g(d, 6, 14, 88, 5), { fontSize: fs(d, 16), align: 'left', color: 'ink', bold: true, opacity: 0.7 }),
        t('text', afterLabel, g(d, 6, 44, 88, 5), { fontSize: fs(d, 16), align: 'left', color: 'accent', bold: true }),
        t('text', copy.badge ?? 'Drop your photo', g(d, 8, 30, 84, 4), { fontSize: fs(d, 13), align: 'center', color: 'ink', opacity: 0.55 }),
        t('text', copy.badge ?? 'Drop your photo', g(d, 8, 60, 84, 4), { fontSize: fs(d, 13), align: 'center', color: 'ink', opacity: 0.55 }),
        t('heading', copy.title, g(d, 8, 4, 84, 8), { fontSize: fs(d, 30), align: 'left', color: 'ink', level: 2 }),
        t('text', copy.body ?? '', g(d, 10, 79, 80, 10), { fontSize: fs(d, 16), align: 'left', color: 'ink', opacity: 0.8 }),
      ]
    : [
        s(g(d, 6, 22, 42, 46), { shape: 'rectangle', color: 'soft' }),
        s(g(d, 52, 22, 42, 46), { shape: 'rectangle', color: 'accent', opacity: 0.2 }),
        t('text', beforeLabel, g(d, 6, 15, 42, 5), { fontSize: fs(d, 17), align: 'center', color: 'ink', bold: true, opacity: 0.7 }),
        t('text', afterLabel, g(d, 52, 15, 42, 5), { fontSize: fs(d, 17), align: 'center', color: 'accent', bold: true }),
        t('text', copy.badge ?? 'Drop your photo', g(d, 8, 42, 38, 5), { fontSize: fs(d, 14), align: 'center', color: 'ink', opacity: 0.55 }),
        t('text', copy.badge ?? 'Drop your photo', g(d, 54, 42, 38, 5), { fontSize: fs(d, 14), align: 'center', color: 'ink', opacity: 0.55 }),
        s(g(d, 47, 38, 6, 6), { shape: 'circle', color: 'paper' }),
        t('heading', copy.title, g(d, 8, 6, 84, 8), { fontSize: fs(d, 34), align: 'center', color: 'ink', level: 2 }),
        t('text', copy.body ?? '', g(d, 10, 72, 80, 10), { fontSize: fs(d, 18), align: 'center', color: 'ink', opacity: 0.8 }),
      ];
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 30, 86, 40, 7), { color: 'accent' }));
  return page(size, blocks);
};

/** 11 — Event invitation: date tile + details + RSVP. */
export const eventInvite: Composer<{ dateTile?: boolean; decor?: 'confetti' | 'frame' | 'ring' | 'none' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const blocks: TemplateBlockSpec[] = [];
  if (options?.decor === 'confetti') {
    blocks.push(s(g(d, 8, 6, 16, 16), { art: 'dots', color: 'accent', opacity: 0.6 }));
    blocks.push(s(g(d, 78, 78, 14, 14), { art: 'dots', color: 'accent', opacity: 0.6 }));
  }
  if (options?.decor === 'frame') {
    blocks.push(s(g(d, 4, 4, 92, 92), { art: 'corner-frame', artStroke: true, color: 'accent', opacity: 0.5 }));
  }
  if (options?.decor === 'ring') {
    blocks.push(s(g(d, 26, 22, 48, 48), { art: 'ring', color: 'accent', opacity: 0.4 }));
  }
  if (options?.dateTile !== false && copy.date) {
    blocks.push(s(g(d, 34, 10, 32, 12), { shape: 'rectangle', color: 'ink' }));
    blocks.push(t('heading', copy.date, g(d, 34, 11.4, 32, 8), { fontSize: fs(d, 24), align: 'center', color: 'paper', level: 3 }));
  }
  blocks.push(t('heading', copy.title, g(d, 10, 28, 80, 16), { fontSize: fs(d, 54), align: 'center', color: 'ink', level: 1, font: 'display' }));
  if (copy.subtitle) blocks.push(t('text', copy.subtitle, g(d, 14, 46, 72, 8), { fontSize: fs(d, 20), align: 'center', color: 'ink', opacity: 0.8 }));
  if (copy.location) {
    blocks.push(s(g(d, 30, 58, 40, 6), { art: 'pin', artStroke: true, color: 'accent', opacity: 0 }));
    blocks.push(t('text', copy.location, g(d, 14, 58, 72, 5), { fontSize: fs(d, 17), align: 'center', color: 'ink', bold: true }));
  }
  if (copy.date && options?.dateTile === false) blocks.push(t('text', copy.date, g(d, 14, 65, 72, 5), { fontSize: fs(d, 17), align: 'center', color: 'accent', bold: true }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 30, 78, 40, 7.5), { color: 'accent' }));
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 14, 90, 72, 4), { fontSize: fs(d, 14), align: 'center', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 12 — Countdown: massive number + label + date + CTA. */
export const countdownPost: Composer<{ value?: string; decor?: 'band' | 'dots' | 'ring' | 'arc' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const decor = options?.decor ?? 'band';
  const blocks: TemplateBlockSpec[] = [
    ...(decor === 'dots'
      ? [s(g(d, 8, 6, 18, 18), { art: 'dots', color: 'accent', opacity: 0.55 })]
      : decor === 'ring'
        ? [s(g(d, 24, 22, 52, 50), { art: 'ring', color: 'accent', opacity: 0.45 })]
        : decor === 'arc'
          ? [s(g(d, -18, -14, 46, 46), { art: 'quarter-arc', color: 'accent', opacity: 0.4 })]
          : [s(g(d, 0, 30, 100, 34), { shape: 'rectangle', color: 'accent', opacity: 0.1 })]),
    t('heading', options?.value ?? copy.badge ?? '7', g(d, 20, 24, 60, 34), { fontSize: fs(d, 150), align: 'center', color: 'accent', level: 1, font: 'geometric' }),
    t('text', (copy.eyebrow ?? 'days to go').toUpperCase(), g(d, 20, 62, 60, 5), { fontSize: fs(d, 18), align: 'center', color: 'ink', bold: true }),
    t('heading', copy.title, g(d, 10, 10, 80, 10), { fontSize: fs(d, 40), align: 'center', color: 'ink', level: 2 }),
  ];
  if (copy.date) blocks.push(t('text', copy.date, g(d, 14, 72, 72, 5), { fontSize: fs(d, 18), align: 'center', color: 'ink', opacity: 0.75 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 30, 81, 40, 7), { color: 'accent' }));
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 14, 92, 72, 4), { fontSize: fs(d, 14), align: 'center', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 13 — Webinar/agent promo: host row + details + register. */
export const webinarPromo: Composer<{ hostPhoto?: boolean }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? 'Live session', 'left', 6));
  blocks.push(t('heading', copy.title, g(d, 8, 14, 84, 14), { fontSize: fs(d, 46), align: 'left', color: 'ink', level: 1 }));
  if (copy.body) blocks.push(t('text', copy.body, g(d, 8, 30, 84, 10), { fontSize: fs(d, 19), align: 'left', color: 'ink', opacity: 0.8 }));
  if (options?.hostPhoto) {
    blocks.push(s(g(d, 8, 44, 20, 20), { shape: 'circle', color: 'soft' }));
    blocks.push(t('text', 'Host photo', g(d, 8, 52, 20, 4), { fontSize: fs(d, 12), align: 'center', color: 'ink', opacity: 0.55 }));
    blocks.push(t('text', copy.name ?? '', g(d, 31, 46, 60, 5), { fontSize: fs(d, 19), align: 'left', color: 'ink', bold: true }));
    blocks.push(t('text', copy.role ?? '', g(d, 31, 52, 60, 4), { fontSize: fs(d, 15), align: 'left', color: 'ink', opacity: 0.7 }));
  } else if (copy.name) {
    blocks.push(s(g(d, 8, 46, 9, 9), { shape: 'circle', color: 'accent' }));
    blocks.push(t('text', copy.name, g(d, 20, 47, 70, 5), { fontSize: fs(d, 19), align: 'left', color: 'ink', bold: true }));
  }
  if (copy.date) {
    blocks.push(s(g(d, 8, 62, 5, 5), { art: 'calendar', artStroke: true, color: 'accent' }));
    blocks.push(t('text', copy.date, g(d, 15, 62.4, 76, 5), { fontSize: fs(d, 16), align: 'left', color: 'ink' }));
  }
  if (copy.location) {
    blocks.push(s(g(d, 8, 70, 5, 5), { art: 'video', artStroke: true, color: 'accent' }));
    blocks.push(t('text', copy.location, g(d, 15, 70.4, 76, 5), { fontSize: fs(d, 16), align: 'left', color: 'ink' }));
  }
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 8, 82, 44, 7.5), { color: 'accent' }));
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 8, 92, 84, 4), { fontSize: fs(d, 13), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 14 — Lead magnet: promise + deliverables + form strip. */
export const leadMagnet: Composer<{ bulletCount?: 3 | 4 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const count = options?.bulletCount ?? 3;
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(s(g(d, 0, 0, 100, 30), { shape: 'rectangle', color: 'accent', opacity: 0.1 }));
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? 'Free download', 'left', 6));
  blocks.push(t('heading', copy.title, g(d, 8, 14, 84, 14), { fontSize: fs(d, 44), align: 'left', color: 'ink', level: 1 }));
  (copy.items ?? []).slice(0, count).forEach((item, index) => {
    blocks.push(s(g(d, 8, 36 + index * 9, 5.5, 5.5), { art: 'check', artStroke: true, color: 'accent' }));
    blocks.push(t('text', item, g(d, 16, 36.4 + index * 9, 76, 5.5), { fontSize: fs(d, 18), align: 'left', color: 'ink' }));
  });
  blocks.push(s(g(d, 8, 70, 84, 14), { shape: 'rectangle', color: 'soft', opacity: 0.9 }));
  blocks.push(t('text', copy.body ?? 'Get it in your inbox', g(d, 11, 72.5, 78, 5), { fontSize: fs(d, 15), align: 'left', color: 'ink', opacity: 0.7 }));
  blocks.push(s(g(d, 11, 78, 52, 5), { shape: 'rectangle', color: 'paper' }));
  blocks.push(btn(copy.cta ?? 'Send it to me', g(d, 66, 78, 23, 5), { color: 'accent' }));
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 8, 90, 84, 4), { fontSize: fs(d, 13), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 15 — Wide email header / banner: logo mark + heading + button. */
export const emailHeader: Composer<{ markShape?: 'circle' | 'square' | 'seal' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const mark = options?.markShape ?? 'circle';
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(s(g(d, 4, 8, 8, 20), mark === 'circle' ? { shape: 'circle', color: 'accent' } : mark === 'square' ? { shape: 'square', color: 'accent' } : { art: 'seal', color: 'accent' }));
  blocks.push(t('heading', copy.eyebrow ?? 'BRAND', g(d, 14, 14, 30, 8), { fontSize: fs(d, 20), align: 'left', color: 'ink', level: 3 }));
  blocks.push(t('heading', copy.title, g(d, 4, 34, 64, 26), { fontSize: fs(d, 58), align: 'left', color: 'ink', level: 1, font: 'geometric' }));
  if (copy.subtitle) blocks.push(t('text', copy.subtitle, g(d, 4, 62, 56, 12), { fontSize: fs(d, 21), align: 'left', color: 'ink', opacity: 0.75 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 4, 80, 26, 10), { color: 'accent' }));
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 4, 93, 60, 4), { fontSize: fs(d, 13), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 16 — Wide ad banner: split headline/offer + CTA block. */
export const adBanner: Composer<{ ctaSide?: 'right' | 'left' | 'bottom' | 'split'; panelStyle?: 'block' | 'wave' | 'dots' | 'corner' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  if (options?.ctaSide === 'bottom') {
    return page(size, [
      t('heading', copy.title, g(d, 4, 12, 92, 26), { fontSize: fs(d, 64), align: 'center', color: 'ink', level: 1, font: 'geometric' }),
      t('text', copy.subtitle ?? '', g(d, 10, 42, 80, 12), { fontSize: fs(d, 21), align: 'center', color: 'ink', opacity: 0.75 }),
      s(g(d, 0, 62, 100, 38), { shape: 'rectangle', color: 'accent', opacity: 0.14 }),
      ...(copy.cta ? [btn(copy.cta, g(d, 30, 74, 40, 16), { color: 'accent' })] : []),
      ...(copy.footer ? [t('text', copy.footer, g(d, 4, 93, 92, 5), { fontSize: fs(d, 14), align: 'center', color: 'ink', opacity: 0.6 })] : []),
    ]);
  }
  if (options?.ctaSide === 'split') {
    return page(size, [
      t('heading', copy.title, g(d, 4, 8, 92, 24), { fontSize: fs(d, 58), align: 'left', color: 'ink', level: 1, font: 'geometric' }),
      t('text', copy.subtitle ?? '', g(d, 4, 36, 52, 16), { fontSize: fs(d, 20), align: 'left', color: 'ink', opacity: 0.75 }),
      s(g(d, 60, 36, 36, 26), { shape: 'rectangle', color: 'soft' }),
      ...(copy.cta ? [btn(copy.cta, g(d, 4, 66, 30, 16), { color: 'accent' })] : []),
      ...(copy.footer ? [t('text', copy.footer, g(d, 40, 70, 56, 5), { fontSize: fs(d, 14), align: 'right', color: 'ink', opacity: 0.6 })] : []),
    ]);
  }
  const right = options?.ctaSide !== 'left';
  const blocks: TemplateBlockSpec[] = [];
  const panel = options?.panelStyle ?? 'block';
  if (panel === 'block') blocks.push(s(g(d, right ? 66 : 0, 0, 34, 100), { shape: 'rectangle', color: 'accent', opacity: 0.12 }));
  else if (panel === 'wave') blocks.push(s(g(d, right ? 60 : 0, 30, 40, 40), { art: 'wave', color: 'accent', opacity: 0.4 }));
  else if (panel === 'dots') blocks.push(s(g(d, right ? 68 : 4, 8, 28, 28), { art: 'dots', color: 'accent', opacity: 0.55 }));
  else blocks.push(s(g(d, right ? 82 : -6, -14, 24, 130), { art: 'quarter-arc', color: 'accent', opacity: 0.35 }));
  blocks.push(t('heading', copy.title, g(d, right ? 4 : 38, 14, right ? 58 : 56, 30), { fontSize: fs(d, 66), align: 'left', color: 'ink', level: 1, font: 'geometric' }));
  if (copy.subtitle) blocks.push(t('text', copy.subtitle, g(d, right ? 4 : 38, 48, 52, 14), { fontSize: fs(d, 21), align: 'left', color: 'ink', opacity: 0.75 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, right ? 70 : 40, 70, 26, 14), { color: 'accent' }));
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, right ? 4 : 38, 88, 52, 5), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 17 — Flash offer: discount burst, code chip, expiry. */
export const flashOffer: Composer<{ discount?: string; shape?: 'seal' | 'bolt' | 'starburst' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const shape = options?.shape ?? 'seal';
  const blocks: TemplateBlockSpec[] = [];
  if (shape === 'seal') {
    blocks.push(s(g(d, 22, 14, 56, 56), { art: 'seal', color: 'accent' }));
    blocks.push(t('heading', options?.discount ?? copy.price ?? '40%', g(d, 30, 30, 40, 20), { fontSize: fs(d, 74), align: 'center', color: 'paper', level: 1 }));
  } else if (shape === 'bolt') {
    blocks.push(s(g(d, 30, 12, 40, 46), { art: 'boltfill', color: 'accent' }));
    blocks.push(t('heading', options?.discount ?? copy.price ?? '40%', g(d, 20, 60, 60, 12), { fontSize: fs(d, 70), align: 'center', color: 'ink', level: 1 }));
  } else {
    blocks.push(s(g(d, 24, 12, 52, 52), { art: 'starburst', color: 'accent' }));
    blocks.push(t('heading', options?.discount ?? copy.price ?? '40%', g(d, 30, 28, 40, 20), { fontSize: fs(d, 70), align: 'center', color: 'paper', level: 1 }));
  }
  blocks.push(t('heading', copy.title, g(d, 10, 72, 80, 8), { fontSize: fs(d, 38), align: 'center', color: 'ink', level: 2 }));
  if (copy.body) {
    blocks.push(s(g(d, 26, 82, 48, 6.5), { shape: 'rectangle', color: 'ink' }));
    blocks.push(t('text', copy.body, g(d, 26, 82.8, 48, 5), { fontSize: fs(d, 17), align: 'center', color: 'paper', bold: true }));
  }
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 14, 92, 72, 4), { fontSize: fs(d, 14), align: 'center', color: 'ink', opacity: 0.65 }));
  return page(size, blocks);
};

/** 18 — Remarketing card: product photo, price tag, CTA. */
export const remarketingCard: Composer<{ cornerBadge?: boolean }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(...photoPlaceholder(d, 10, 8, 80, 42, copy.badge ?? 'Product photo', 'soft'));
  if (options?.cornerBadge && copy.price) {
    blocks.push(s(g(d, 66, 12, 26, 12), { art: 'tag', artStroke: true, color: 'accent' }));
  }
  blocks.push(t('heading', copy.title, g(d, 10, 56, 80, 10), { fontSize: fs(d, 40), align: 'left', color: 'ink', level: 2 }));
  if (copy.price) blocks.push(t('heading', copy.price, g(d, 10, 68, 40, 8), { fontSize: fs(d, 34), align: 'left', color: 'accent', level: 3 }));
  if (copy.body) blocks.push(t('text', copy.body, g(d, 10, 77, 80, 6), { fontSize: fs(d, 17), align: 'left', color: 'ink', opacity: 0.75 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 10, 86, 44, 7.5), { color: 'accent' }));
  return page(size, blocks);
};

/** 19 — Brand board: logo mark, palette swatches, type specimen. */
export const brandBoard: Composer<{ swatchCount?: 4 | 5 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const count = options?.swatchCount ?? 5;
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 6, 60, 8), { fontSize: fs(d, 36), align: 'left', color: 'ink', level: 2 }));
  blocks.push(s(g(d, 8, 17, 84, 0.9), { shape: 'rectangle', color: 'accent' }));
  blocks.push(s(g(d, 8, 24, 26, 26), { shape: 'rectangle', color: 'soft' }));
  blocks.push(s(g(d, 16, 32, 10, 10), { art: 'spark', artStroke: true, color: 'ink' }));
  blocks.push(t('text', copy.badge ?? 'Logo mark', g(d, 8, 52, 26, 4), { fontSize: fs(d, 13), align: 'center', color: 'ink', opacity: 0.6 }));
  blocks.push(t('heading', 'Aa', g(d, 44, 22, 22, 18), { fontSize: fs(d, 90), align: 'left', color: 'ink', font: 'display', level: 1 }));
  blocks.push(t('text', copy.body ?? 'Primary typeface — headline weights', g(d, 44, 44, 48, 5), { fontSize: fs(d, 15), align: 'left', color: 'ink', opacity: 0.7 }));
  const swatches = ['accent', 'ink', 'soft', 'paper', 'bg'].slice(0, count);
  swatches.forEach((role, index) => {
    blocks.push(s(g(d, 8 + index * (84 / count), 58, 84 / count - 1.5, 16), { shape: 'rectangle', color: role }));
  });
  blocks.push(t('text', copy.footer ?? 'Colour system', g(d, 8, 76, 84, 4), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.6 }));
  blocks.push(t('text', copy.contact ?? '', g(d, 8, 88, 84, 4), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.7 }));
  return page(size, blocks);
};

/** 20 — Media kit: stats row + about + contact panel. */
export const mediaKit: Composer<{ statCount?: 2 | 3 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const statCount = options?.statCount ?? 3;
  const stats = (copy.stats ?? []).slice(0, statCount);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 6, 84, 9), { fontSize: fs(d, 42), align: 'left', color: 'ink', level: 1 }));
  stats.forEach((stat, index) => {
    const w = 84 / stats.length;
    blocks.push(s(g(d, 8 + index * w, 20, w - 2, 16), { shape: 'rectangle', color: index === 0 ? 'accent' : 'soft', opacity: index === 0 ? 0.16 : 1 }));
    blocks.push(t('heading', stat.value, g(d, 8 + index * w, 22, w - 2, 8), { fontSize: fs(d, 40), align: 'center', color: 'ink', level: 2 }));
    blocks.push(t('text', stat.label, g(d, 8 + index * w, 31, w - 2, 4), { fontSize: fs(d, 13), align: 'center', color: 'ink', opacity: 0.7 }));
  });
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? 'About', 'left', 44));
  blocks.push(t('text', copy.body ?? '', g(d, 8, 50, 84, 18), { fontSize: fs(d, 18), align: 'left', color: 'ink' }));
  blocks.push(s(g(d, 8, 72, 84, 16), { shape: 'rectangle', color: 'ink' }));
  blocks.push(t('text', copy.contact ?? '', g(d, 11, 74.5, 78, 5), { fontSize: fs(d, 16), align: 'left', color: 'paper', bold: true }));
  blocks.push(t('text', copy.footer ?? '', g(d, 11, 81, 78, 4), { fontSize: fs(d, 14), align: 'left', color: 'paper', opacity: 0.8 }));
  blocks.push(t('text', copy.subtitle ?? '', g(d, 8, 92, 84, 4), { fontSize: fs(d, 13), align: 'left', color: 'ink', opacity: 0.55 }));
  return page(size, blocks);
};

/** 21 — Business card: name, role, contact, mark. */
export const businessCard: Composer<{ markSide?: 'left' | 'right'; layout?: 'stacked' | 'split'; accentBand?: 'none' | 'bottom' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const markRight = options?.markSide !== 'left';
  const blocks: TemplateBlockSpec[] = [];
  if (options?.layout === 'split') {
    blocks.push(s(g(d, 0, 0, 34, 100), { shape: 'rectangle', color: 'accent' }));
    blocks.push(s(g(d, 10, 40, 14, 20), { art: 'spark', artStroke: true, color: 'paper' }));
    blocks.push(t('heading', copy.name ?? copy.title, g(d, 40, 20, 52, 10), { fontSize: fs(d, 34), align: 'left', color: 'ink', level: 2 }));
    blocks.push(t('text', copy.role ?? copy.subtitle ?? '', g(d, 40, 34, 52, 6), { fontSize: fs(d, 17), align: 'left', color: 'accent', bold: true }));
    blocks.push(s(g(d, 40, 48, 52, 0.8), { shape: 'rectangle', color: 'soft' }));
    blocks.push(t('text', copy.contact ?? '', g(d, 40, 56, 54, 12), { fontSize: fs(d, 15), align: 'left', color: 'ink' }));
  } else {
    blocks.push(s(g(d, markRight ? 76 : 8, 12, 16, 16), { shape: 'circle', color: 'accent' }));
    blocks.push(t('heading', copy.name ?? copy.title, g(d, 8, 38, 84, 10), { fontSize: fs(d, 36), align: 'left', color: 'ink', level: 2 }));
    blocks.push(t('text', copy.role ?? copy.subtitle ?? '', g(d, 8, 52, 84, 5), { fontSize: fs(d, 17), align: 'left', color: 'accent', bold: true }));
    blocks.push(s(g(d, 8, 62, 30, 0.8), { shape: 'rectangle', color: 'soft' }));
    blocks.push(t('text', copy.contact ?? '', g(d, 8, 70, 84, 12), { fontSize: fs(d, 15), align: 'left', color: 'ink' }));
  }
  if (options?.accentBand === 'bottom') {
    blocks.push(s(g(d, 0, 90, 100, 10), { shape: 'rectangle', color: 'accent' }));
    blocks.push(s(g(d, 0, 88, 100, 2), { shape: 'rectangle', color: 'ink' }));
  }
  return page(size, blocks);
};

/** 22 — Letterhead: mark, rule, body block, footer strip (document sizes). */
export const letterhead: Composer<{ ruleStyle?: 'solid' | 'double'; markSide?: 'left' | 'right' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const blocks: TemplateBlockSpec[] = [];
  const markRight = options?.markSide === 'right';
  blocks.push(s(g(d, markRight ? 85 : 8, 5, 7, 7), { shape: 'circle', color: 'accent' }));
  blocks.push(t('heading', copy.eyebrow ?? copy.title, g(d, markRight ? 33 : 17, 6, 50, 5), { fontSize: fs(d, 20), align: markRight ? 'right' : 'left', color: 'ink', level: 3 }));
  blocks.push(s(g(d, 8, 13, 84, 0.6), { shape: 'rectangle', color: 'ink' }));
  if (options?.ruleStyle === 'double') blocks.push(s(g(d, 8, 14.2, 84, 0.4), { shape: 'rectangle', color: 'accent' }));
  blocks.push(t('heading', copy.title, g(d, 8, 18, 84, 7), { fontSize: fs(d, 30), align: 'left', color: 'ink', level: 2 }));
  blocks.push(t('text', copy.body ?? '', g(d, 8, 27, 84, 40), { fontSize: fs(d, 16), align: 'left', color: 'ink' }));
  blocks.push(s(g(d, 8, 90, 84, 5), { shape: 'rectangle', color: 'soft', opacity: 0.8 }));
  blocks.push(t('text', copy.contact ?? copy.footer ?? '', g(d, 10, 91.2, 80, 3), { fontSize: fs(d, 12), align: 'left', color: 'ink', opacity: 0.75 }));
  return page(size, blocks);
};

/** 23 — Service menu: list rows with dotted price leaders. */
export const serviceMenu: Composer<{ rowCount?: 3 | 4 | 5 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const rows = (copy.items ?? []).slice(0, options?.rowCount ?? 4);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 5, 70, 8), { fontSize: fs(d, 38), align: 'left', color: 'ink', level: 1 }));
  blocks.push(t('text', copy.subtitle ?? '', g(d, 8, 13, 84, 4), { fontSize: fs(d, 15), align: 'left', color: 'ink', opacity: 0.65 }));
  blocks.push(s(g(d, 8, 19, 84, 0.7), { shape: 'rectangle', color: 'accent' }));
  rows.forEach((row, index) => {
    const [label, price] = row.split('|').map((part) => part.trim());
    const y = 24 + index * 13;
    blocks.push(t('heading', label ?? row, g(d, 8, y, 60, 5), { fontSize: fs(d, 20), align: 'left', color: 'ink', level: 3 }));
    blocks.push(s(g(d, 8, y + 4.6, 84, 0.35), { shape: 'rectangle', color: 'soft' }));
    if (price) blocks.push(t('heading', price, g(d, 68, y, 24, 5), { fontSize: fs(d, 20), align: 'right', color: 'accent', level: 3 }));
  });
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 8, 92, 84, 4), { fontSize: fs(d, 13), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 24 — Agency one-pager: hero + 3 service tiles + contact band. */
export const agencyOnePager: Composer<{ tileLabels?: [string, string, string] }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const tiles = options?.tileLabels ?? ['Strategy', 'Design', 'Growth'];
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 6, 84, 12), { fontSize: fs(d, 46), align: 'left', color: 'ink', level: 1, font: 'geometric' }));
  blocks.push(t('text', copy.body ?? '', g(d, 8, 20, 70, 8), { fontSize: fs(d, 17), align: 'left', color: 'ink', opacity: 0.75 }));
  tiles.forEach((tile, index) => {
    blocks.push(s(g(d, 8 + index * 29, 32, 26, 20), { shape: 'rectangle', color: index === 1 ? 'accent' : 'soft', opacity: index === 1 ? 0.18 : 1 }));
    blocks.push(s(g(d, 14 + index * 29, 36, 8, 8), { art: ['target', 'layers', 'trending-up'][index]!, artStroke: true, color: 'ink' }));
    blocks.push(t('text', tile, g(d, 8 + index * 29, 46, 26, 4), { fontSize: fs(d, 15), align: 'center', color: 'ink', bold: true }));
  });
  if (copy.subtitle) blocks.push(t('heading', copy.subtitle, g(d, 8, 58, 84, 7), { fontSize: fs(d, 26), align: 'left', color: 'ink', level: 3 }));
  blocks.push(t('text', copy.contact ?? '', g(d, 8, 66, 84, 8), { fontSize: fs(d, 16), align: 'left', color: 'ink' }));
  blocks.push(s(g(d, 0, 86, 100, 14), { shape: 'rectangle', color: 'ink' }));
  blocks.push(btn(copy.cta ?? 'Book a call', g(d, 8, 89, 30, 8), { color: 'accent' }));
  blocks.push(t('text', copy.footer ?? '', g(d, 44, 90.5, 50, 4), { fontSize: fs(d, 13), align: 'right', color: 'paper', opacity: 0.85 }));
  return page(size, blocks);
};

/** 25 — Product showcase: hero photo, chips, price, CTA. */
export const productShowcase: Composer<{ chipCount?: 3 | 4; photoStyle?: 'panel' | 'circle' | 'arch'; layout?: 'stacked' | 'split' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const chips = (copy.items ?? []).slice(0, options?.chipCount ?? 3);
  const split = options?.layout === 'split';
  const blocks: TemplateBlockSpec[] = [];
  if (split) {
    blocks.push(s(g(d, 5, 8, 44, 84), { shape: 'rectangle', color: 'soft', opacity: 0.8 }));
    blocks.push(s(g(d, 19, 40, 16, 16), { art: 'bag', artStroke: true, color: 'ink', opacity: 0.5 }));
    blocks.push(t('text', copy.badge ?? 'Product photo', g(d, 5, 62, 44, 5), { fontSize: fs(d, 13), align: 'center', color: 'ink', opacity: 0.55 }));
  } else if (options?.photoStyle === 'circle') {
    blocks.push(s(g(d, 24, 6, 52, 44), { shape: 'rectangle', color: 'soft', opacity: 0.4 }));
    blocks.push(s(g(d, 28, 6, 44, 44), { shape: 'circle', color: 'soft', opacity: 0.9 }));
    blocks.push(s(g(d, 42, 16, 16, 16), { art: 'bag', artStroke: true, color: 'ink', opacity: 0.5 }));
    blocks.push(t('text', copy.badge ?? 'Product photo', g(d, 24, 40, 52, 5), { fontSize: fs(d, 13), align: 'center', color: 'ink', opacity: 0.55 }));
  } else if (options?.photoStyle === 'arch') {
    blocks.push(s(g(d, 6, 6, 88, 44), { shape: 'rectangle', color: 'soft', opacity: 0.7 }));
    blocks.push(s(g(d, 30, 6, 40, 44), { shape: 'rectangle', color: 'accent', opacity: 0.18 }));
    blocks.push(s(g(d, 42, 12, 16, 16), { art: 'bag', artStroke: true, color: 'ink', opacity: 0.5 }));
    blocks.push(t('text', copy.badge ?? 'Product photo', g(d, 30, 40, 40, 5), { fontSize: fs(d, 13), align: 'center', color: 'ink', opacity: 0.55 }));
  } else {
    blocks.push(s(g(d, 6, 6, 88, 44), { shape: 'rectangle', color: 'soft', opacity: 0.8 }));
    blocks.push(s(g(d, 42, 10, 16, 16), { art: 'bag', artStroke: true, color: 'ink', opacity: 0.5 }));
    blocks.push(t('text', copy.badge ?? 'Product photo', g(d, 6, 40, 88, 5), { fontSize: fs(d, 13), align: 'center', color: 'ink', opacity: 0.55 }));
  }
  const cx = split ? 53 : 6;
  const cw = split ? 41 : 88;
  chips.forEach((chip, index) => {
    const w = split ? 12.5 : 26;
    blocks.push(s(g(d, cx + index * (w + 1.5), 54, w, 6), { shape: 'rectangle', color: 'paper' }));
    blocks.push(t('text', chip, g(d, cx + index * (w + 1.5), 54.8, w, 4.4), { fontSize: fs(d, 13), align: 'center', color: 'ink', bold: true }));
  });
  blocks.push(t('heading', copy.title, g(d, cx, 64, cw - 24, 9), { fontSize: fs(d, 36), align: 'left', color: 'ink', level: 2 }));
  if (copy.price) blocks.push(t('heading', copy.price, g(d, split ? 74 : 70, 64, 22, 9), { fontSize: fs(d, 32), align: 'right', color: 'accent', level: 3 }));
  if (copy.body) blocks.push(t('text', copy.body, g(d, cx, 75, cw, 8), { fontSize: fs(d, 16), align: 'left', color: 'ink', opacity: 0.8 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, cx, 87, 42, 7.5), { color: 'accent' }));
  return page(size, blocks);
};

/** 26 — Feature comparison: two columns with check rows. */
export const featureCompare: Composer<{ rowCount?: 3 | 4; swapColumns?: boolean }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const rows = (copy.items ?? []).slice(0, options?.rowCount ?? 4);
  const blocks: TemplateBlockSpec[] = [];
  const swap = options?.swapColumns === true;
  blocks.push(t('heading', copy.title, g(d, 8, 5, 84, 8), { fontSize: fs(d, 34), align: 'center', color: 'ink', level: 2 }));
  blocks.push(t('heading', swap ? (copy.eyebrow ?? 'Them') : (copy.subtitle ?? 'Us'), g(d, 58, 14, 34, 5), { fontSize: fs(d, 18), align: 'center', color: 'accent', level: 3 }));
  blocks.push(t('heading', swap ? (copy.subtitle ?? 'Us') : (copy.eyebrow ?? 'Them'), g(d, 8, 14, 34, 5), { fontSize: fs(d, 18), align: 'center', color: 'ink', opacity: 0.5, level: 3 }));
  blocks.push(s(g(d, 46, 13, 0.8, 6 + rows.length * 12), { shape: 'rectangle', color: 'soft' }));
  rows.forEach((row, index) => {
    const y = 21 + index * 12;
    blocks.push(t('text', row, g(d, 4, y, 40, 5), { fontSize: fs(d, 14), align: 'center', color: swap ? 'ink' : 'ink', bold: swap }));
    blocks.push(s(g(d, 22, y + 5.6, 4, 4), swap ? { art: 'check', artStroke: true, color: 'accent' } : { shape: 'circle', color: 'soft' }));
    blocks.push(t('text', row, g(d, 54, y, 40, 5), { fontSize: fs(d, 14), align: 'center', color: 'ink', bold: !swap }));
    blocks.push(s(g(d, 72, y + 5.6, 4, 4), swap ? { shape: 'circle', color: 'soft' } : { art: 'check', artStroke: true, color: 'accent' }));
  });
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 28, 88, 44, 7), { color: 'accent' }));
  return page(size, blocks);
};

/** 27 — Pricing card: plan, price, feature list, CTA. */
export const pricingCard: Composer<{ highlight?: boolean; featureCount?: 3 | 4 | 5 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const highlight = options?.highlight ?? false;
  const features = (copy.items ?? []).slice(0, options?.featureCount ?? 4);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(s(g(d, 10, 6, 80, 88), { shape: 'rectangle', color: highlight ? 'ink' : 'paper' }));
  if (copy.badge) {
    blocks.push(s(g(d, 62, 3, 30, 6), { art: 'badge-flag', color: 'accent' }));
    blocks.push(t('text', copy.badge, g(d, 64, 4.2, 24, 3.6), { fontSize: fs(d, 13), align: 'center', color: 'paper', bold: true }));
  }
  blocks.push(t('text', (copy.eyebrow ?? 'Plan').toUpperCase(), g(d, 14, 10, 60, 4), { fontSize: fs(d, 14), align: 'left', color: highlight ? 'paper' : 'ink', bold: true, opacity: 0.7 }));
  blocks.push(t('heading', copy.title, g(d, 14, 15, 60, 7), { fontSize: fs(d, 34), align: 'left', color: highlight ? 'paper' : 'ink', level: 2 }));
  blocks.push(t('heading', copy.price ?? '', g(d, 14, 23, 60, 9), { fontSize: fs(d, 56), align: 'left', color: 'accent', level: 1 }));
  blocks.push(t('text', copy.body ?? 'per month', g(d, 14, 33, 60, 4), { fontSize: fs(d, 13), align: 'left', color: highlight ? 'paper' : 'ink', opacity: 0.6 }));
  features.forEach((feature, index) => {
    blocks.push(s(g(d, 14, 40 + index * 8, 4, 4), { art: 'check', artStroke: true, color: 'accent' }));
    blocks.push(t('text', feature, g(d, 20, 40.2 + index * 8, 62, 4.4), { fontSize: fs(d, 15), align: 'left', color: highlight ? 'paper' : 'ink' }));
  });
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 14, 82, 72, 8), { color: 'accent' }));
  return page(size, blocks);
};

/** 28 — Catalog page: 2×2 product grid (document sizes). */
export const catalogGrid: Composer<{ cellLabels?: string[]; columns?: 2 | 3 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const labels = options?.cellLabels ?? ['Item', 'Item', 'Item', 'Item'];
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 4, 60, 6), { fontSize: fs(d, 30), align: 'left', color: 'ink', level: 2 }));
  blocks.push(t('text', copy.subtitle ?? '', g(d, 70, 5, 22, 4), { fontSize: fs(d, 13), align: 'right', color: 'ink', opacity: 0.6 }));
  const cols = options?.columns ?? 2;
  const rowsShown = Math.ceil(Math.min(labels.length, cols === 3 ? 6 : 4) / cols);
  labels.slice(0, cols * rowsShown).forEach((label, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cellW = (84 - (cols - 1) * 3) / cols;
    const cellH = cols === 3 ? 24 : 24;
    const x = 8 + col * (cellW + 3);
    const y = 13 + row * 36;
    blocks.push(s(g(d, x, y, cellW, cellH), { shape: 'rectangle', color: row === col ? 'soft' : 'paper' }));
    blocks.push(t('text', label, g(d, x, y + 9.5, cellW, 4), { fontSize: fs(d, 13), align: 'center', color: 'ink', opacity: 0.55 }));
    blocks.push(s(g(d, x, y + 25, cellW, 5), { shape: 'rectangle', color: 'ink', opacity: 0.06 }));
    blocks.push(t('heading', (copy.items ?? [])[index] ?? 'New', g(d, x + 1, y + 25.6, cellW * 0.6, 4), { fontSize: fs(d, 14), align: 'left', color: 'ink', level: 3 }));
    blocks.push(t('text', (copy.stats ?? [])[index]?.value ?? '', g(d, x + cellW * 0.62, y + 25.6, cellW * 0.35, 4), { fontSize: fs(d, 13), align: 'right', color: 'accent', bold: true }));
  });
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 8, 90, 84, 4), { fontSize: fs(d, 13), align: 'left', color: 'ink', opacity: 0.6 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 8, 94, 36, 5), { color: 'accent' }));
  return page(size, blocks);
};

/** 29 — Pitch deck cover (wide). */
export const pitchCover: Composer<{ decor?: 'bars' | 'ring' | 'wave' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const decor = options?.decor ?? 'bars';
  const blocks: TemplateBlockSpec[] = [];
  if (decor === 'bars') {
    blocks.push(s(g(d, 72, 0, 28, 100), { shape: 'rectangle', color: 'accent', opacity: 0.14 }));
    blocks.push(s(g(d, 80, 0, 20, 100), { shape: 'rectangle', color: 'accent', opacity: 0.18 }));
  }
  if (decor === 'ring') blocks.push(s(g(d, 70, 18, 26, 62), { art: 'ring', color: 'accent', opacity: 0.7 }));
  if (decor === 'wave') blocks.push(s(g(d, 0, 74, 100, 26), { art: 'wave', color: 'accent', opacity: 0.8 }));
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? '', 'left', 10));
  blocks.push(t('heading', copy.title, g(d, 8, 20, 70, 30), { fontSize: fs(d, 88), align: 'left', color: 'ink', level: 1, font: 'geometric' }));
  if (copy.subtitle) blocks.push(t('text', copy.subtitle, g(d, 8, 56, 56, 10), { fontSize: fs(d, 24), align: 'left', color: 'ink', opacity: 0.75 }));
  blocks.push(s(g(d, 8, 76, 12, 0.8), { shape: 'rectangle', color: 'accent' }));
  blocks.push(t('text', [copy.name, copy.role].filter(Boolean).join(' · '), g(d, 8, 80, 60, 5), { fontSize: fs(d, 17), align: 'left', color: 'ink', bold: true }));
  blocks.push(t('text', copy.date ?? '', g(d, 8, 86, 60, 4), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 30 — Deck section divider (wide). */
export const deckSection: Composer<{ index?: string; align?: 'left' | 'right'; fill?: boolean; badgeStyle?: 'plain' | 'circled' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const right = options?.align === 'right';
  const x = right ? 30 : 6;
  const index = options?.index ?? copy.badge ?? '01';
  return page(size, [
    s(g(d, 0, 0, 100, 100), { shape: 'rectangle', color: options?.fill ? 'accent' : 'ink', opacity: options?.fill ? 0.12 : 0.04 }),
    ...(options?.badgeStyle === 'circled' ? [s(g(d, right ? 68 : 4, 10, 26, 28), { shape: 'circle', color: 'soft' })] : []),
    t('heading', index, g(d, x, 14, 20, 20), { fontSize: fs(d, 110), align: right ? 'right' : 'left', color: 'accent', level: 1, font: 'geometric' }),
    t('heading', copy.title, g(d, x, 42, 64, 16), { fontSize: fs(d, 64), align: right ? 'right' : 'left', color: 'ink', level: 1 }),
    s(g(d, right ? 80 : 6, 62, 14, 0.7), { shape: 'rectangle', color: 'accent' }),
    t('text', copy.subtitle ?? '', g(d, x, 66, 60, 8), { fontSize: fs(d, 20), align: right ? 'right' : 'left', color: 'ink', opacity: 0.7 }),
  ]);
};

/** 31 — Deck bullets page (wide). */
export const deckBullets: Composer<{ bulletCount?: 3 | 4 | 5; panelSide?: 'right' | 'none' | 'left' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const count = options?.bulletCount ?? 4;
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 5, 8, 50, 10), { fontSize: fs(d, 40), align: 'left', color: 'ink', level: 2 }));
  blocks.push(s(g(d, 5, 19, 8, 0.6), { shape: 'rectangle', color: 'accent' }));
  (copy.items ?? []).slice(0, count).forEach((item, index) => {
    const y = 28 + index * (58 / count);
    blocks.push(s(g(d, 5, y, 3.2, 3.2), { shape: 'circle', color: 'accent' }));
    blocks.push(t('text', item, g(d, 10, y - 0.8, 52, 5), { fontSize: fs(d, 19), align: 'left', color: 'ink' }));
  });
  const panel = options?.panelSide ?? 'right';
  if (panel === 'right') {
    blocks.push(s(g(d, 68, 8, 27, 66), { shape: 'rectangle', color: 'soft', opacity: 0.8 }));
    blocks.push(s(g(d, 75, 24, 13, 13), { art: 'chart-line', artStroke: true, color: 'ink', opacity: 0.5 }));
  } else if (panel === 'left') {
    blocks.push(s(g(d, 5, 8, 20, 50), { shape: 'rectangle', color: 'soft', opacity: 0.8 }));
    blocks.push(s(g(d, 11, 24, 8, 8), { art: 'chart-line', artStroke: true, color: 'ink', opacity: 0.5 }));
  }
  if (copy.body) blocks.push(t('text', copy.body, g(d, 68, 78, 27, 14), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.7 }));
  return page(size, blocks);
};

/** 32 — Deck stats page (wide). */
export const deckStats: Composer<{ statCount?: 2 | 3 | 4; align?: 'left' | 'center'; divider?: boolean }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const stats = (copy.stats ?? []).slice(0, options?.statCount ?? 3);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 5, 8, 90, 10), { fontSize: fs(d, 42), align: 'left', color: 'ink', level: 2 }));
  blocks.push(s(g(d, 5, 19, 10, 0.6), { shape: 'rectangle', color: 'accent' }));
  const centered = options?.align === 'center';
  stats.forEach((stat, index) => {
    const w = 90 / stats.length;
    blocks.push(t('heading', stat.value, g(d, 5 + index * w, 32, w - 3, 22), { fontSize: fs(d, 110), align: centered ? 'center' : 'left', color: index === 0 ? 'accent' : 'ink', level: 1, font: 'geometric' }));
    blocks.push(t('text', stat.label, g(d, 5 + index * w, 58, w - 3, 8), { fontSize: fs(d, 18), align: centered ? 'center' : 'left', color: 'ink', opacity: 0.75 }));
    blocks.push(s(g(d, 5 + index * w, 70, w - 8, 1), { shape: 'rectangle', color: 'soft' }));
    if (options?.divider && index > 0) blocks.push(s(g(d, 5 + index * w - 1.5, 34, 0.4, 32), { shape: 'rectangle', color: 'soft' }));
  });
  if (copy.body) blocks.push(t('text', copy.body, g(d, 5, 82, 80, 10), { fontSize: fs(d, 16), align: 'left', color: 'ink', opacity: 0.7 }));
  return page(size, blocks);
};

/** 33 — Case study page (wide). */
export const caseStudyPage: Composer<{ metricValue?: string }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? 'Case study', 'left', 8));
  blocks.push(t('heading', copy.title, g(d, 5, 15, 56, 12), { fontSize: fs(d, 44), align: 'left', color: 'ink', level: 1 }));
  blocks.push(t('text', copy.body ?? '', g(d, 5, 30, 56, 26), { fontSize: fs(d, 18), align: 'left', color: 'ink' }));
  blocks.push(t('text', copy.subtitle ?? '', g(d, 5, 62, 56, 18), { fontSize: fs(d, 16), align: 'left', color: 'ink', opacity: 0.75 }));
  blocks.push(s(g(d, 66, 15, 29, 70), { shape: 'rectangle', color: 'accent', opacity: 0.12 }));
  blocks.push(t('heading', options?.metricValue ?? copy.price ?? '+240%', g(d, 68, 26, 25, 16), { fontSize: fs(d, 72), align: 'center', color: 'accent', level: 1 }));
  blocks.push(t('text', copy.footer ?? 'Key result', g(d, 68, 44, 25, 5), { fontSize: fs(d, 15), align: 'center', color: 'ink', bold: true }));
  blocks.push(s(g(d, 72, 56, 17, 20), { art: 'chart-columns', color: 'ink', opacity: 0.55 }));
  return page(size, blocks);
};

/** 34 — Portfolio grid page (wide). */
export const portfolioGrid: Composer<{ cellCount?: 2 | 3 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const count = options?.cellCount ?? 3;
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 4, 6, 60, 8), { fontSize: fs(d, 36), align: 'left', color: 'ink', level: 2 }));
  blocks.push(t('text', copy.subtitle ?? '', g(d, 4, 15, 60, 4), { fontSize: fs(d, 15), align: 'left', color: 'ink', opacity: 0.65 }));
  const w = (92 - (count - 1) * 2) / count;
  for (let index = 0; index < count; index += 1) {
    blocks.push(s(g(d, 4 + index * (w + 2), 22, w, 52), { shape: 'rectangle', color: index % 2 ? 'soft' : 'paper' }));
    blocks.push(t('text', (copy.items ?? [])[index] ?? 'Project', g(d, 4 + index * (w + 2), 76, w, 4), { fontSize: fs(d, 14), align: 'left', color: 'ink', bold: true }));
    blocks.push(t('text', (copy.stats ?? [])[index]?.label ?? '', g(d, 4 + index * (w + 2), 80, w, 4), { fontSize: fs(d, 12), align: 'left', color: 'ink', opacity: 0.6 }));
  }
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 4, 88, 20, 8), { color: 'accent' }));
  return page(size, blocks);
};

/** 35 — Timeline infographic (vertical). */
export const timelineVertical: Composer<{ nodeCount?: 3 | 4 | 5; lineSide?: 'left' | 'right' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const count = options?.nodeCount ?? 4;
  const items = (copy.items ?? []).slice(0, count);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 4, 84, 7), { fontSize: fs(d, 34), align: 'left', color: 'ink', level: 2 }));
  const rightSide = options?.lineSide === 'right';
  blocks.push(s(g(d, rightSide ? 88 : 11.2, 14, 0.8, 74), { shape: 'rectangle', color: 'accent', opacity: 0.5 }));
  items.forEach((item, index) => {
    const y = 16 + index * (70 / count);
    blocks.push(s(g(d, rightSide ? 85.3 : 8.5, y, 6, 6), { shape: 'circle', color: index === 0 ? 'accent' : 'paper' }));
    blocks.push(t('heading', (copy.stats ?? [])[index]?.value ?? `Step ${index + 1}`, g(d, rightSide ? 52 : 18, y - 1, 30, 4.5), { fontSize: fs(d, 16), align: rightSide ? 'right' : 'left', color: 'accent', level: 3 }));
    blocks.push(t('text', item, g(d, rightSide ? 6 : 18, y + 4, rightSide ? 76 : 72, 9), { fontSize: fs(d, 16), align: rightSide ? 'right' : 'left', color: 'ink' }));
  });
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 8, 94, 84, 4), { fontSize: fs(d, 12), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 36 — Process steps (horizontal flow, wide). */
export const processSteps: Composer<{ stepCount?: 3 | 4 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const steps = (copy.items ?? []).slice(0, options?.stepCount ?? 3);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 4, 8, 92, 8), { fontSize: fs(d, 40), align: 'left', color: 'ink', level: 2 }));
  const w = 84 / steps.length;
  steps.forEach((step, index) => {
    const x = 4 + index * (w + 4);
    blocks.push(s(g(d, x, 26, w, 44), { shape: 'rectangle', color: index % 2 ? 'soft' : 'paper' }));
    blocks.push(s(g(d, x + w / 2 - 5, 30, 10, 10), { shape: 'circle', color: 'accent' }));
    blocks.push(t('heading', String(index + 1), g(d, x + w / 2 - 5, 31.4, 10, 7), { fontSize: fs(d, 22), align: 'center', color: 'paper', level: 3 }));
    blocks.push(t('text', step, g(d, x + 3, 44, w - 6, 22), { fontSize: fs(d, 16), align: 'left', color: 'ink' }));
    if (index < steps.length - 1) blocks.push(s(g(d, x + w + 0.4, 46, 3.2, 3.2), { art: 'arrow-right', artStroke: true, color: 'accent' }));
  });
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 4, 82, 92, 5), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.65 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 4, 88, 24, 8), { color: 'accent' }));
  return page(size, blocks);
};

/** 37 — Comparison bars infographic. */
export const comparisonBars: Composer<{ rowCount?: 3 | 4; bars?: number[] }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const rows = (copy.items ?? []).slice(0, options?.rowCount ?? 4);
  const bars = options?.bars ?? rows.map((_, index) => 90 - index * 18);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 5, 84, 8), { fontSize: fs(d, 32), align: 'left', color: 'ink', level: 2 }));
  blocks.push(t('text', copy.subtitle ?? '', g(d, 8, 13, 84, 4), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.65 }));
  rows.forEach((row, index) => {
    const y = 21 + index * 15;
    blocks.push(t('text', row, g(d, 8, y, 40, 5), { fontSize: fs(d, 15), align: 'left', color: 'ink', bold: true }));
    blocks.push(s(g(d, 8, y + 6, Math.max(6, bars[index] ?? 60), 5.5), { shape: 'rectangle', color: index === 0 ? 'accent' : 'soft' }));
    blocks.push(t('text', (copy.stats ?? [])[index]?.value ?? '', g(d, 8 + Math.max(6, bars[index] ?? 60) + 1, y + 6.2, 20, 5), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.7 }));
  });
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 8, 92, 84, 4), { fontSize: fs(d, 12), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 38 — Big data card: hero number + delta + mini bars. */
export const dataCard: Composer<{ bars?: number[] }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const bars = options?.bars ?? [30, 45, 38, 62, 74, 90];
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(s(g(d, 8, 8, 84, 84), { shape: 'rectangle', color: 'paper' }));
  blocks.push(t('text', (copy.eyebrow ?? 'Metric').toUpperCase(), g(d, 12, 12, 60, 4), { fontSize: fs(d, 14), align: 'left', color: 'ink', bold: true, opacity: 0.6 }));
  blocks.push(t('heading', copy.price ?? copy.title, g(d, 12, 18, 60, 16), { fontSize: fs(d, 84), align: 'left', color: 'ink', level: 1, font: 'geometric' }));
  blocks.push(s(g(d, 12, 38, 14, 5), { shape: 'rectangle', color: 'accent', opacity: 0.2 }));
  blocks.push(t('text', copy.badge ?? '', g(d, 12, 38.6, 14, 4), { fontSize: fs(d, 13), align: 'center', color: 'accent', bold: true }));
  blocks.push(t('text', copy.title, g(d, 12, 46, 70, 5), { fontSize: fs(d, 16), align: 'left', color: 'ink' }));
  bars.slice(0, 8).forEach((height, index) => {
    const barHeight = Math.max(4, height * 0.3);
    blocks.push(s(g(d, 12 + index * 10, 76 - barHeight, 7, barHeight), { shape: 'rectangle', color: index === bars.length - 1 ? 'accent' : 'soft' }));
  });
  blocks.push(s(g(d, 12, 78, 76, 0.5), { shape: 'rectangle', color: 'soft' }));
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 12, 84, 70, 4), { fontSize: fs(d, 12), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 39 — Cycle diagram: nodes on a ring. */
export const cycleDiagram: Composer<{ nodeCount?: 3 | 4; layout?: 'ring' | 'row' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const nodes = (copy.items ?? []).slice(0, options?.nodeCount ?? 3);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 5, 84, 7), { fontSize: fs(d, 32), align: 'center', color: 'ink', level: 2 }));
  const row = options?.layout === 'row';
  const positions = row
    ? nodes.map((_, index) => [8 + index * (88 / Math.max(1, nodes.length)), 34])
    : nodes.length === 3
      ? [[42, 20], [72, 42], [42, 64]]
      : [[42, 20], [72, 42], [42, 64], [12, 42]];
  if (!row) blocks.push(s(g(d, 30, 26, 40, 40), { art: 'ring', color: 'accent', opacity: 0.5 }));
  else nodes.forEach((_, index) => { if (index < nodes.length - 1) blocks.push(s(g(d, 8 + (index + 1) * (88 / Math.max(1, nodes.length)) - 8.5, 38, 5, 5), { art: 'arrow-right', artStroke: true, color: 'accent' })); });
  nodes.forEach((node, index) => {
    const [nx, ny] = positions[index]!;
    blocks.push(s(g(d, nx, ny, 18, row ? 12 : 16), { shape: 'circle', color: index % 2 ? 'soft' : 'accent', opacity: index % 2 ? 1 : 0.85 }));
    blocks.push(t('text', node, g(d, nx + 0.5, ny + (row ? 4 : 6), 17, 4), { fontSize: fs(d, row ? 11 : 12), align: 'center', color: index % 2 ? 'ink' : 'paper', bold: true }));
  });
  if (copy.body) blocks.push(t('text', copy.body, g(d, 14, 88, 72, 6), { fontSize: fs(d, 14), align: 'center', color: 'ink', opacity: 0.7 }));
  return page(size, blocks);
};

/** 40 — Lesson summary / study sheet. */
export const lessonSummary: Composer<{ pointCount?: 3 | 4 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const count = options?.pointCount ?? 4;
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(s(g(d, 0, 0, 100, 16), { shape: 'rectangle', color: 'accent', opacity: 0.12 }));
  blocks.push(...eyebrowChip(d, copy.eyebrow ?? 'Lesson recap', 'left', 4));
  blocks.push(t('heading', copy.title, g(d, 8, 18, 84, 8), { fontSize: fs(d, 34), align: 'left', color: 'ink', level: 2 }));
  (copy.items ?? []).slice(0, count).forEach((item, index) => {
    const y = 30 + index * 13;
    blocks.push(s(g(d, 8, y, 6.5, 6.5, 45), { shape: 'square', color: 'accent' }));
    blocks.push(t('text', item, g(d, 17, y + 0.4, 75, 6), { fontSize: fs(d, 16), align: 'left', color: 'ink' }));
  });
  blocks.push(s(g(d, 8, 84, 84, 10), { shape: 'rectangle', color: 'soft', opacity: 0.8 }));
  blocks.push(t('text', copy.body ?? '', g(d, 11, 86, 78, 6), { fontSize: fs(d, 15), align: 'left', color: 'ink', bold: true }));
  return page(size, blocks);
};

/** 41 — Worksheet: name line + numbered answer blanks. */
export const worksheet: Composer<{ questionCount?: 3 | 4 | 5 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const count = options?.questionCount ?? 4;
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 4, 70, 6), { fontSize: fs(d, 28), align: 'left', color: 'ink', level: 2 }));
  blocks.push(t('text', copy.eyebrow ?? 'Name:', g(d, 8, 11, 12, 4), { fontSize: fs(d, 15), align: 'left', color: 'ink' }));
  blocks.push(s(g(d, 18, 12.4, 40, 0.5), { shape: 'rectangle', color: 'ink', opacity: 0.5 }));
  blocks.push(t('text', copy.subtitle ?? 'Date:', g(d, 66, 11, 10, 4), { fontSize: fs(d, 15), align: 'left', color: 'ink' }));
  blocks.push(s(g(d, 74, 12.4, 18, 0.5), { shape: 'rectangle', color: 'ink', opacity: 0.5 }));
  blocks.push(t('text', copy.body ?? '', g(d, 8, 17, 84, 8), { fontSize: fs(d, 15), align: 'left', color: 'ink', opacity: 0.8 }));
  (copy.items ?? []).slice(0, count).forEach((question, index) => {
    const y = 28 + index * 15;
    blocks.push(t('heading', `${index + 1}. ${question}`, g(d, 8, y, 84, 4.5), { fontSize: fs(d, 16), align: 'left', color: 'ink', level: 3 }));
    blocks.push(s(g(d, 8, y + 6, 84, 0.45), { shape: 'rectangle', color: 'soft' }));
    blocks.push(s(g(d, 8, y + 9.5, 84, 0.45), { shape: 'rectangle', color: 'soft' }));
  });
  return page(size, blocks);
};

/** 42 — Educational poster: big fact + illustration disc. */
export const eduPoster: Composer<{ factValue?: string; icon?: 'leaf' | 'sun' | 'book' | 'moon'; style?: 'disc' | 'panel' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const blocks: TemplateBlockSpec[] = [];
  if (options?.style === 'panel') {
    blocks.push(s(g(d, 8, 10, 84, 84), { shape: 'rectangle', color: 'accent', opacity: 0.1 }));
    blocks.push(s(g(d, 42, 14, 16, 16), { art: options.icon ?? 'leaf', artStroke: true, color: 'accent' }));
  } else {
    blocks.push(s(g(d, 14, 22, 72, 72), { shape: 'circle', color: 'accent', opacity: 0.12 }));
    blocks.push(s(g(d, 40, 26, 20, 20), { art: options?.icon ?? 'leaf', artStroke: true, color: 'accent' }));
  }
  blocks.push(t('heading', options?.factValue ?? copy.price ?? '73%', g(d, 20, 42, 60, 14), { fontSize: fs(d, 96), align: 'center', color: 'ink', level: 1, font: 'geometric' }));
  blocks.push(t('text', copy.title, g(d, 14, 58, 72, 8), { fontSize: fs(d, 22), align: 'center', color: 'ink', bold: true }));
  if (copy.body) blocks.push(t('text', copy.body, g(d, 18, 68, 64, 8), { fontSize: fs(d, 15), align: 'center', color: 'ink', opacity: 0.7 }));
  blocks.push(t('text', copy.footer ?? '', g(d, 14, 92, 72, 4), { fontSize: fs(d, 12), align: 'center', color: 'ink', opacity: 0.55 }));
  return page(size, blocks);
};

/** 43 — Course promo: modules + price + CTA. */
export const coursePromo: Composer<{ moduleCount?: 3 | 4; headerStyle?: 'dark' | 'accent' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const count = options?.moduleCount ?? 3;
  const blocks: TemplateBlockSpec[] = [];
  const accentHeader = options?.headerStyle === 'accent';
  blocks.push(s(g(d, 0, 0, 100, 26), { shape: 'rectangle', color: accentHeader ? 'accent' : 'ink' }));
  blocks.push(t('text', (copy.eyebrow ?? 'Online course').toUpperCase(), g(d, 8, 4, 60, 4), { fontSize: fs(d, 14), align: 'left', color: 'paper', bold: true, opacity: 0.8 }));
  blocks.push(t('heading', copy.title, g(d, 8, 9, 84, 14), { fontSize: fs(d, 40), align: 'left', color: 'paper', level: 1 }));
  (copy.items ?? []).slice(0, count).forEach((item, index) => {
    const y = 32 + index * 11;
    blocks.push(s(g(d, 8, y, 8, 6), { shape: 'rectangle', color: 'accent', opacity: 0.18 }));
    blocks.push(t('text', `0${index + 1}`, g(d, 8, y + 0.6, 8, 4.5), { fontSize: fs(d, 14), align: 'center', color: 'accent', bold: true }));
    blocks.push(t('text', item, g(d, 19, y + 0.6, 60, 4.8), { fontSize: fs(d, 17), align: 'left', color: 'ink', bold: true }));
  });
  if (copy.price) {
    blocks.push(t('heading', copy.price, g(d, 70, 72, 22, 8), { fontSize: fs(d, 40), align: 'right', color: 'accent', level: 2 }));
  }
  if (copy.body) blocks.push(t('text', copy.body, g(d, 8, 74, 56, 6), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.7 }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 8, 84, 42, 7.5), { color: 'accent' }));
  return page(size, blocks);
};

/** 44 — Blog header / article hero (wide). */
export const blogHeader: Composer<{ align?: 'left' | 'center'; rule?: boolean; waveSide?: 'bottom' | 'right' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const align = options?.align ?? 'left';
  const blocks: TemplateBlockSpec[] = [];
  if ((options?.waveSide ?? 'bottom') === 'right') blocks.push(s(g(d, 74, 0, 26, 100), { art: 'wave', color: 'accent', opacity: 0.25 }));
  else blocks.push(s(g(d, 0, 62, 100, 38), { art: 'wave', color: 'accent', opacity: 0.25 }));
  blocks.push(s(g(d, align === 'center' ? 38 : 4, 8, 24, 6), { shape: 'rectangle', color: 'accent', opacity: 0.15 }));
  blocks.push(t('text', (copy.eyebrow ?? 'Article').toUpperCase(), g(d, align === 'center' ? 38 : 4, 8.8, 24, 4.4), { fontSize: fs(d, 14), align: 'center', color: 'accent', bold: true }));
  blocks.push(t('heading', copy.title, g(d, align === 'center' ? 10 : 4, 18, align === 'center' ? 80 : 70, 22), { fontSize: fs(d, 62), align, color: 'ink', level: 1, font: 'display' }));
  blocks.push(t('text', copy.subtitle ?? '', g(d, align === 'center' ? 15 : 4, 44, align === 'center' ? 70 : 56, 10), { fontSize: fs(d, 20), align, color: 'ink', opacity: 0.75 }));
  blocks.push(t('text', [copy.name, copy.date].filter(Boolean).join('  ·  '), g(d, align === 'center' ? 15 : 4, 56, 60, 4), { fontSize: fs(d, 14), align, color: 'ink', opacity: 0.6 }));
  if (options?.rule) blocks.push(s(g(d, align === 'center' ? 38 : 4, 54, 24, 1.2), { shape: 'rectangle', color: 'accent' }));
  return page(size, blocks);
};

/** 45 — Newsletter masthead page. */
export const newsletter: Composer<{ teaserCount?: 3 | 4 }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const count = options?.teaserCount ?? 3;
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 5, 60, 8), { fontSize: fs(d, 40), align: 'left', color: 'ink', level: 1, font: 'display' }));
  blocks.push(t('text', copy.eyebrow ?? '', g(d, 70, 8, 22, 4), { fontSize: fs(d, 13), align: 'right', color: 'accent', bold: true }));
  blocks.push(s(g(d, 8, 15, 84, 1), { shape: 'rectangle', color: 'ink' }));
  blocks.push(t('heading', copy.subtitle ?? '', g(d, 8, 19, 84, 7), { fontSize: fs(d, 26), align: 'left', color: 'ink', level: 2 }));
  (copy.items ?? []).slice(0, count).forEach((item, index) => {
    const y = 30 + index * 15;
    blocks.push(s(g(d, 8, y + 1, 3.2, 10), { shape: 'rectangle', color: 'accent' }));
    blocks.push(t('heading', (copy.stats ?? [])[index]?.label ?? item, g(d, 14, y, 78, 5), { fontSize: fs(d, 19), align: 'left', color: 'ink', level: 3 }));
    blocks.push(t('text', (copy.stats ?? [])[index]?.value ?? item, g(d, 14, y + 5.5, 78, 7), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.7 }));
  });
  blocks.push(s(g(d, 8, 82, 84, 8), { shape: 'rectangle', color: 'soft', opacity: 0.8 }));
  blocks.push(t('text', copy.body ?? '', g(d, 11, 84, 78, 4.5), { fontSize: fs(d, 13), align: 'left', color: 'ink' }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 8, 92, 32, 6), { color: 'accent' }));
  return page(size, blocks);
};

/** 46 — Editorial magazine cover. */
export const editorialCover: Composer<{ coverLines?: string[]; rules?: boolean }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const lines = (options?.coverLines ?? copy.items ?? []).slice(0, 4);
  const blocks: TemplateBlockSpec[] = [];
  if (options?.rules) {
    blocks.push(s(g(d, 8, 2.5, 84, 0.9), { shape: 'rectangle', color: 'ink' }));
    blocks.push(s(g(d, 8, 1, 84, 0.5), { shape: 'rectangle', color: 'accent' }));
  }
  blocks.push(t('heading', copy.eyebrow ?? 'ISSUE 12', g(d, 8, 4, 40, 4), { fontSize: fs(d, 15), align: 'left', color: 'accent', bold: true }));
  blocks.push(t('heading', copy.title, g(d, 8, 9, 84, 22), { fontSize: fs(d, 96), align: 'left', color: 'ink', level: 1, font: 'display' }));
  blocks.push(s(g(d, 8, 34, 84, 0.8), { shape: 'rectangle', color: 'ink' }));
  lines.forEach((line, index) => {
    blocks.push(t('text', line, g(d, 8, 38 + index * 7, 70, 5), { fontSize: fs(d, 19), align: 'left', color: 'ink', bold: index === 0 }));
  });
  blocks.push(s(g(d, 8, 64, 84, 26), { shape: 'rectangle', color: 'soft', opacity: 0.7 }));
  blocks.push(t('text', copy.badge ?? 'Cover story photo', g(d, 8, 75, 84, 4), { fontSize: fs(d, 13), align: 'center', color: 'ink', opacity: 0.55 }));
  blocks.push(t('text', copy.footer ?? '', g(d, 8, 93, 84, 4), { fontSize: fs(d, 13), align: 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 47 — Pull-quote article graphic. */
export const pullQuote: Composer<{ ruleStyle?: 'top' | 'sides' | 'none' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const style = options?.ruleStyle ?? 'top';
  const blocks: TemplateBlockSpec[] = [];
  if (style === 'top') blocks.push(s(g(d, 20, 22, 60, 1.4), { shape: 'rectangle', color: 'accent' }));
  if (style === 'sides') {
    blocks.push(s(g(d, 8, 20, 1.4, 60), { shape: 'rectangle', color: 'accent' }));
    blocks.push(s(g(d, 90.6, 20, 1.4, 60), { shape: 'rectangle', color: 'accent' }));
  }
  blocks.push(t('heading', copy.quote ?? copy.title, g(d, 12, 28, 76, 34), { fontSize: fs(d, 42), align: 'center', color: 'ink', font: 'display', level: 1 }));
  blocks.push(s(g(d, 44, 66, 12, 0.8), { shape: 'rectangle', color: 'soft' }));
  blocks.push(t('text', copy.attribution ?? '', g(d, 20, 70, 60, 5), { fontSize: fs(d, 16), align: 'center', color: 'ink', italic: true, opacity: 0.8 }));
  blocks.push(t('text', (copy.eyebrow ?? '').toUpperCase(), g(d, 20, 88, 60, 4), { fontSize: fs(d, 13), align: 'center', color: 'accent', bold: true }));
  return page(size, blocks);
};

/** 48 — Proposal cover (document sizes). */
export const proposalCover: Composer<{ clientMark?: boolean; layout?: 'classic' | 'split' }> = ({ size, copy, options }) => {
  if (options?.layout === 'split') {
    const d = pageDims(size);
    return page(size, [
      s(g(d, 52, 0, 48, 100), { shape: 'rectangle', color: 'accent', opacity: 0.14 }),
      t('text', (copy.eyebrow ?? 'Project proposal').toUpperCase(), g(d, 8, 12, 40, 4), { fontSize: fs(d, 14), align: 'left', color: 'accent', bold: true }),
      t('heading', copy.title, g(d, 8, 18, 44, 26), { fontSize: fs(d, 44), align: 'left', color: 'ink', level: 1, font: 'display' }),
      s(g(d, 8, 50, 16, 0.8), { shape: 'rectangle', color: 'accent' }),
      t('text', [copy.name, copy.role].filter(Boolean).join(' · '), g(d, 8, 55, 42, 6), { fontSize: fs(d, 15), align: 'left', color: 'ink', bold: true }),
      t('text', copy.contact ?? '', g(d, 8, 63, 42, 8), { fontSize: fs(d, 12), align: 'left', color: 'ink', opacity: 0.7 }),
      t('text', [copy.date, copy.footer].filter(Boolean).join('   ·   '), g(d, 56, 80, 40, 10), { fontSize: fs(d, 12), align: 'right', color: 'ink', opacity: 0.8 }),
    ]);
  }
  const d = pageDims(size);
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(s(g(d, 0, 0, 100, 8), { shape: 'rectangle', color: 'accent' }));
  if (options?.clientMark !== false) {
    blocks.push(s(g(d, 8, 12, 10, 10), { shape: 'rectangle', color: 'soft' }));
    blocks.push(t('text', copy.badge ?? 'Logo', g(d, 8, 15.5, 10, 3), { fontSize: fs(d, 11), align: 'center', color: 'ink', opacity: 0.6 }));
  }
  blocks.push(t('text', (copy.eyebrow ?? 'Project proposal').toUpperCase(), g(d, 8, 28, 60, 4), { fontSize: fs(d, 15), align: 'left', color: 'accent', bold: true }));
  blocks.push(t('heading', copy.title, g(d, 8, 34, 84, 18), { fontSize: fs(d, 54), align: 'left', color: 'ink', level: 1, font: 'display' }));
  blocks.push(s(g(d, 8, 56, 20, 0.8), { shape: 'rectangle', color: 'accent' }));
  blocks.push(t('text', [copy.name, copy.role].filter(Boolean).join(' · '), g(d, 8, 62, 70, 5), { fontSize: fs(d, 17), align: 'left', color: 'ink', bold: true }));
  blocks.push(t('text', copy.contact ?? '', g(d, 8, 68, 70, 4), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.7 }));
  blocks.push(s(g(d, 8, 86, 84, 8), { shape: 'rectangle', color: 'soft', opacity: 0.7 }));
  blocks.push(t('text', [copy.date, copy.footer].filter(Boolean).join('   ·   '), g(d, 11, 88, 78, 4), { fontSize: fs(d, 13), align: 'left', color: 'ink' }));
  return page(size, blocks);
};

/** 49 — Project brief: meta grid + scope list (document sizes). */
export const projectBrief: Composer<{ metaFields?: Array<{ label: string; value: string }>; accentBar?: boolean }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const meta = options?.metaFields ?? [
    { label: 'Client', value: copy.eyebrow ?? '' },
    { label: 'Timeline', value: copy.date ?? '' },
    { label: 'Budget', value: copy.price ?? '' },
  ];
  const bar = options?.accentBar === true;
  const bx = bar ? 12 : 8;
  const blocks: TemplateBlockSpec[] = [];
  if (bar) blocks.push(s(g(d, 4, 0, 2.4, 100), { shape: 'rectangle', color: 'accent' }));
  blocks.push(t('heading', copy.title, g(d, bx, 5, 84, 7), { fontSize: fs(d, 32), align: 'left', color: 'ink', level: 1 }));
  blocks.push(s(g(d, bx, 13, 84, 0.7), { shape: 'rectangle', color: 'accent' }));
  meta.slice(0, 3).forEach((field, index) => {
    const w = 84 / meta.length;
    blocks.push(t('text', field.label.toUpperCase(), g(d, bx + index * w, 17, w, 3.5), { fontSize: fs(d, 12), align: 'left', color: 'ink', bold: true, opacity: 0.55 }));
    blocks.push(t('heading', field.value, g(d, bx + index * w, 21, w - 2, 5), { fontSize: fs(d, 17), align: 'left', color: 'ink', level: 3 }));
  });
  blocks.push(s(g(d, 8, 29, 84, 0.5), { shape: 'rectangle', color: 'soft' }));
  blocks.push(t('heading', copy.subtitle ?? 'Scope', g(d, 8, 33, 60, 5), { fontSize: fs(d, 22), align: 'left', color: 'ink', level: 2 }));
  (copy.items ?? []).slice(0, 5).forEach((item, index) => {
    blocks.push(s(g(d, 8, 41 + index * 7.5, 3, 3), { shape: 'square', color: 'accent' }));
    blocks.push(t('text', item, g(d, 13.5, 41.2 + index * 7.5, 78, 4.5), { fontSize: fs(d, 15), align: 'left', color: 'ink' }));
  });
  blocks.push(t('text', copy.body ?? '', g(d, 8, 80, 84, 10), { fontSize: fs(d, 14), align: 'left', color: 'ink', opacity: 0.75 }));
  return page(size, blocks);
};

/** 50 — Resume page (document sizes). */
export const resumePage: Composer<{ sectionCount?: 2 | 3; sidebar?: boolean }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const sections = (copy.items ?? []).slice(0, options?.sectionCount ?? 3);
  const sidebar = options?.sidebar === true;
  const bx = sidebar ? 14 : 8;
  const bw = sidebar ? 78 : 84;
  const blocks: TemplateBlockSpec[] = [];
  if (sidebar) {
    blocks.push(s(g(d, 0, 0, 10, 100), { shape: 'rectangle', color: 'ink' }));
    blocks.push(s(g(d, 2, 6, 6, 6), { shape: 'circle', color: 'accent' }));
  }
  blocks.push(t('heading', copy.name ?? copy.title, g(d, bx, 4, bw, 6), { fontSize: fs(d, 34), align: 'left', color: 'ink', level: 1 }));
  blocks.push(t('text', copy.role ?? '', g(d, bx, 10.5, bw, 4), { fontSize: fs(d, 15), align: 'left', color: 'accent', bold: true }));
  blocks.push(t('text', copy.contact ?? '', g(d, bx, 14.5, bw, 3.5), { fontSize: fs(d, 12), align: 'left', color: 'ink', opacity: 0.65 }));
  blocks.push(s(g(d, bx, 19, bw, 0.7), { shape: 'rectangle', color: 'ink' }));
  sections.forEach((section, index) => {
    const y = 22 + index * 24;
    blocks.push(t('heading', section, g(d, bx, y, 40, 4.5), { fontSize: fs(d, 17), align: 'left', color: 'ink', level: 3 }));
    blocks.push(t('text', (copy.stats ?? [])[index]?.value ?? '', g(d, bx, y + 5, bw, 16), { fontSize: fs(d, 13), align: 'left', color: 'ink', opacity: 0.8 }));
  });
  return page(size, blocks);
};

/** 51 — Report page: heading + chart + takeaway (document sizes). */
export const reportPage: Composer<{ bars?: number[] }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const bars = options?.bars ?? [40, 65, 52, 80, 70];
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 4, 84, 6), { fontSize: fs(d, 28), align: 'left', color: 'ink', level: 2 }));
  blocks.push(t('text', copy.subtitle ?? '', g(d, 8, 10.5, 84, 4), { fontSize: fs(d, 13), align: 'left', color: 'ink', opacity: 0.6 }));
  blocks.push(s(g(d, 8, 17, 84, 30), { shape: 'rectangle', color: 'soft', opacity: 0.5 }));
  bars.slice(0, 6).forEach((height, index) => {
    const barHeight = height * 0.24;
    blocks.push(s(g(d, 14 + index * 13, 44 - barHeight, 9, barHeight), { shape: 'rectangle', color: index === bars.length - 1 ? 'accent' : 'ink', opacity: index === bars.length - 1 ? 1 : 0.35 }));
  });
  blocks.push(s(g(d, 12, 44.5, 76, 0.5), { shape: 'rectangle', color: 'ink', opacity: 0.4 }));
  blocks.push(t('heading', copy.body ?? 'Key takeaway', g(d, 8, 52, 84, 5), { fontSize: fs(d, 18), align: 'left', color: 'ink', level: 3 }));
  blocks.push(t('text', copy.footer ?? '', g(d, 8, 59, 84, 14), { fontSize: fs(d, 14), align: 'left', color: 'ink' }));
  blocks.push(s(g(d, 8, 88, 84, 6), { shape: 'rectangle', color: 'accent', opacity: 0.12 }));
  blocks.push(t('text', copy.contact ?? '', g(d, 11, 89.4, 78, 3.5), { fontSize: fs(d, 12), align: 'left', color: 'ink', bold: true }));
  return page(size, blocks);
};

/** 52 — Photo hero social: layered panels + overlay title bar. */
export const photoHero: Composer<{ overlay?: 'band' | 'block' | 'full' | 'top' | 'corner' | 'side' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const overlay = options?.overlay ?? 'band';
  const blocks: TemplateBlockSpec[] = [...photoPlaceholder(d, 0, 0, 100, 100, copy.badge ?? 'Hero photo — drop yours here', 'soft', 0.9)];
  if (overlay === 'band') {
    blocks.push(s(g(d, 0, 62, 100, 24), { shape: 'rectangle', color: 'ink', opacity: 0.82 }));
    blocks.push(t('heading', copy.title, g(d, 8, 65, 84, 9), { fontSize: fs(d, 36), align: 'left', color: 'paper', level: 2 }));
    blocks.push(t('text', copy.subtitle ?? '', g(d, 8, 76, 84, 5), { fontSize: fs(d, 16), align: 'left', color: 'paper', opacity: 0.85 }));
  } else if (overlay === 'block') {
    blocks.push(s(g(d, 8, 56, 84, 26), { shape: 'rectangle', color: 'paper' }));
    blocks.push(t('heading', copy.title, g(d, 11, 60, 78, 9), { fontSize: fs(d, 34), align: 'left', color: 'ink', level: 2 }));
    blocks.push(t('text', copy.subtitle ?? '', g(d, 11, 70, 78, 6), { fontSize: fs(d, 16), align: 'left', color: 'ink', opacity: 0.75 }));
  } else if (overlay === 'top') {
    blocks.push(s(g(d, 0, 8, 100, 22), { shape: 'rectangle', color: 'ink', opacity: 0.82 }));
    blocks.push(t('heading', copy.title, g(d, 8, 11, 84, 8), { fontSize: fs(d, 34), align: 'left', color: 'paper', level: 2 }));
    blocks.push(t('text', copy.subtitle ?? '', g(d, 8, 21, 84, 5), { fontSize: fs(d, 16), align: 'left', color: 'paper', opacity: 0.85 }));
  } else if (overlay === 'corner') {
    blocks.push(s(g(d, 5, 56, 58, 30), { shape: 'rectangle', color: 'paper' }));
    blocks.push(t('heading', copy.title, g(d, 8, 60, 52, 9), { fontSize: fs(d, 32), align: 'left', color: 'ink', level: 2 }));
    blocks.push(t('text', copy.subtitle ?? '', g(d, 8, 70, 52, 8), { fontSize: fs(d, 15), align: 'left', color: 'ink', opacity: 0.75 }));
  } else if (overlay === 'side') {
    blocks.push(s(g(d, 46, 14, 48, 70), { shape: 'rectangle', color: 'paper' }));
    blocks.push(t('heading', copy.title, g(d, 49, 20, 42, 14), { fontSize: fs(d, 30), align: 'left', color: 'ink', level: 2 }));
    blocks.push(t('text', copy.subtitle ?? '', g(d, 49, 38, 42, 16), { fontSize: fs(d, 15), align: 'left', color: 'ink', opacity: 0.75 }));
  } else {
    blocks.push(s(g(d, 0, 0, 100, 100), { shape: 'rectangle', color: 'ink', opacity: 0.55 }));
    blocks.push(t('heading', copy.title, g(d, 8, 34, 84, 16), { fontSize: fs(d, 52), align: 'center', color: 'paper', level: 1 }));
    blocks.push(t('text', copy.subtitle ?? '', g(d, 12, 52, 76, 10), { fontSize: fs(d, 19), align: 'center', color: 'paper', opacity: 0.9 }));
  }
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 8, 89, 40, 7), { color: 'accent' }));
  return page(size, blocks);
};

/** 53 — Announcement document: rule, body, signature (a4/letter). */
export const announcementDoc: Composer<{ rulePlacement?: 'top' | 'under-title'; align?: 'left' | 'center' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const under = options?.rulePlacement === 'under-title';
  const centered = options?.align === 'center';
  const ax = centered ? 14 : 8;
  const aw = centered ? 72 : 84;
  const blocks: TemplateBlockSpec[] = [];
  if (!under) blocks.push(s(g(d, 0, 0, 100, 2.2), { shape: 'rectangle', color: 'accent' }));
  blocks.push(t('heading', copy.title, g(d, ax, 6, aw, 8), { fontSize: fs(d, 38), align: centered ? 'center' : 'left', color: 'ink', level: 1 }));
  if (under) blocks.push(s(g(d, centered ? 35 : 8, 15, 30, 1), { shape: 'rectangle', color: 'accent' }));
  blocks.push(t('text', copy.body ?? '', g(d, ax, 22, aw, 40), { fontSize: fs(d, 17), align: centered ? 'center' : 'left', color: 'ink' }));
  if (copy.quote) {
    blocks.push(s(g(d, ax, 64, aw, 14), { shape: 'rectangle', color: 'soft', opacity: 0.8 }));
    blocks.push(t('text', copy.quote, g(d, ax + 3, 66.5, aw - 6, 9), { fontSize: fs(d, 16), align: centered ? 'center' : 'left', color: 'ink', italic: true }));
  }
  blocks.push(t('text', copy.attribution ?? '— The team', g(d, ax, 84, 50, 4), { fontSize: fs(d, 15), align: centered ? 'center' : 'left', color: 'ink', italic: true }));
  blocks.push(t('text', copy.footer ?? '', g(d, ax, 92, aw, 4), { fontSize: fs(d, 12), align: centered ? 'center' : 'left', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** 54 — Bundle promo: three slots + bundle price banner. */
export const bundlePromo: Composer<{ slotLabels?: [string, string, string]; bannerStyle?: 'ink' | 'accent' | 'paper' }> = ({ size, copy, options }) => {
  const d = pageDims(size);
  const labels = options?.slotLabels ?? ['Item 1', 'Item 2', 'Item 3'];
  const blocks: TemplateBlockSpec[] = [];
  blocks.push(t('heading', copy.title, g(d, 8, 5, 84, 8), { fontSize: fs(d, 36), align: 'center', color: 'ink', level: 2 }));
  labels.slice(0, 3).forEach((label, index) => {
    blocks.push(s(g(d, 8 + index * 29.5, 17, 26, 26), { shape: 'rectangle', color: 'soft' }));
    blocks.push(t('text', label, g(d, 8 + index * 29.5, 27, 26, 4), { fontSize: fs(d, 13), align: 'center', color: 'ink', opacity: 0.55 }));
    blocks.push(t('text', (copy.items ?? [])[index] ?? '', g(d, 8 + index * 29.5, 44, 26, 4), { fontSize: fs(d, 14), align: 'center', color: 'ink', bold: true }));
  });
  const banner = options?.bannerStyle ?? 'ink';
  blocks.push(s(g(d, 8, 54, 84, 12), { shape: 'rectangle', color: banner === 'accent' ? 'accent' : banner === 'paper' ? 'paper' : 'ink' }));
  blocks.push(t('heading', copy.price ?? 'Bundle price', g(d, 11, 56, 40, 8), { fontSize: fs(d, 34), align: 'left', color: banner === 'accent' ? 'paper' : 'accent', level: 2 }));
  blocks.push(t('text', copy.body ?? 'Save when you bundle', g(d, 55, 58.5, 34, 5), { fontSize: fs(d, 14), align: 'right', color: banner === 'paper' ? 'ink' : 'paper' }));
  if (copy.cta) blocks.push(btn(copy.cta, g(d, 26, 72, 48, 8), { color: 'accent' }));
  if (copy.footer) blocks.push(t('text', copy.footer, g(d, 8, 86, 84, 4), { fontSize: fs(d, 12), align: 'center', color: 'ink', opacity: 0.6 }));
  return page(size, blocks);
};

/** Registry used by catalogue files and the audit. */
export const ARCHETYPES = {
  quoteCard,
  typePoster,
  productFeature,
  storyPromo,
  listiclePost,
  testimonialCard,
  pollPost,
  carouselCover,
  carouselTip,
  beforeAfter,
  eventInvite,
  countdownPost,
  webinarPromo,
  leadMagnet,
  emailHeader,
  adBanner,
  flashOffer,
  remarketingCard,
  brandBoard,
  mediaKit,
  businessCard,
  letterhead,
  serviceMenu,
  agencyOnePager,
  productShowcase,
  featureCompare,
  pricingCard,
  catalogGrid,
  pitchCover,
  deckSection,
  deckBullets,
  deckStats,
  caseStudyPage,
  portfolioGrid,
  timelineVertical,
  processSteps,
  comparisonBars,
  dataCard,
  cycleDiagram,
  lessonSummary,
  worksheet,
  eduPoster,
  coursePromo,
  blogHeader,
  newsletter,
  editorialCover,
  pullQuote,
  proposalCover,
  projectBrief,
  resumePage,
  reportPage,
  photoHero,
  announcementDoc,
  bundlePromo,
} as const;

export type ArchetypeId = keyof typeof ARCHETYPES;
