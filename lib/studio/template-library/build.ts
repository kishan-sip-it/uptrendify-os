import {
  CONTENT_PAGE_SIZES,
  hashId,
  type ContentDocBlock,
  type ContentDocPage,
  type ContentDocument,
} from '@/lib/content/document';
import { templateArtById } from './art';
import { contrastRatio, mixOver, requiredRatio } from './contrast';
import {
  TEMPLATE_FONT_FAMILIES,
  type TemplateBlockSpec,
  type TemplateColorRole,
  type TemplateDefinition,
  type TemplatePageSpec,
  type TemplatePalette,
} from './types';

/**
 * Deterministic template builder. A definition plus an accent colour always
 * produces byte-identical pages, so ids stay stable across server/client
 * renders and re-applying a template never shuffles layers.
 */

const clampSize = (value: number): number => Math.max(24, Math.min(4000, Math.round(value)));
const clampCoord = (value: number): number => Math.max(-2000, Math.min(4000, Math.round(value)));
const clampFontSize = (value: number): number => Math.max(8, Math.min(160, Math.round(value)));

function resolveColor(role: TemplateColorRole | string | undefined, palette: TemplatePalette, fallback: string): string {
  if (!role) return fallback;
  if (role === 'ink') return palette.ink;
  if (role === 'accent') return palette.accent;
  if (role === 'accentText') return palette.accentText;
  if (role === 'onAccent') return palette.onAccent;
  if (role === 'soft') return palette.soft;
  if (role === 'paper') return palette.paper;
  if (role === 'bg') return palette.bg;
  return /^#[0-9a-fA-F]{6}$/.test(role) ? role : fallback;
}

/**
 * The colour a text element effectively sits on: the topmost solid-enough
 * shape already drawn beneath its centre (z-order = build order), else the
 * block's own bg, else the page background. Mirrored by the audit via this
 * same export so the two can never drift.
 */
export function effectiveTextBackground(built: ContentDocBlock[], index: number, ownBg: string | null | undefined, pageEffectiveBg: string, self?: ContentDocBlock): string {
  const pageBg = pageEffectiveBg;
  // At build time the current block is not yet in `built`; pass it as `self`.
  const text = self ?? built[index];
  if (!text?.geometry) return ownBg ?? pageBg;
  const cx = text.geometry.x + text.geometry.w / 2;
  const cy = text.geometry.y + text.geometry.h / 2;
  for (let i = index - 1; i >= 0; i -= 1) {
    const shape = built[i];
    if (shape.type !== 'shape' || !shape.geometry || shape.hidden) continue;
    if (shape.svgFillNone) continue; // stroke-only art is not a surface
    const opacity = shape.opacity ?? 1;
    if (opacity < 0.55) continue;
    const g = shape.geometry;
    if (cx < g.x || cx > g.x + g.w || cy < g.y || cy > g.y + g.h) continue;
    // Treat the surface as its solid fill: text renders on top of the shape,
    // and picking against the solid colour is the design-intent assumption
    // shared by the builder ladder and the audit gate.
    return shape.color ?? '#ffffff';
  }
  return ownBg ?? pageBg;
}

/**
 * Contrast ladder: return the first candidate that meets the WCAG requirement
 * against `elementBg`; the last candidate otherwise (the audit still gates it).
 */
export function pickReadable(candidates: string[], elementBg: string, fontSize: number | undefined, bold: boolean): string {
  const required = requiredRatio(fontSize, bold);
  for (const candidate of candidates) {
    if (contrastRatio(candidate, elementBg) >= required) return candidate;
  }
  return candidates[candidates.length - 1]!;
}

function mixHex(a: string, b: string, alpha: number): string {
  const pa = a.replace('#', '');
  const pb = b.replace('#', '');
  const mix = (i: number) => Math.round(parseInt(pa.slice(i, i + 2), 16) * alpha + parseInt(pb.slice(i, i + 2), 16) * (1 - alpha));
  return '#' + [0, 2, 4].map((i) => mix(i).toString(16).padStart(2, '0')).join('');
}

function blockId(templateId: string, pageIndex: number, index: number): string {
  return `t-${hashId(`${templateId}|${pageIndex}|${index}`)}`;
}

function resolvedTextColor0(color: string, shared: { fontSize?: number; bold?: boolean }, palette: TemplatePalette, elementBg: string): string {
  // First candidate: the authored colour itself.
  return color;
}

function buildBlock(spec: TemplateBlockSpec, index: number, pageIndex: number, templateId: string, palette: TemplatePalette, accent: string | null, pageEffectiveBg: string, built: ContentDocBlock[]): ContentDocBlock {
  const id = blockId(templateId, pageIndex, index);
  const geometry = {
    x: clampCoord(spec.x),
    y: clampCoord(spec.y),
    w: clampSize(spec.w),
    h: clampSize(spec.h),
    ...(spec.rotation ? { rotation: Math.max(-180, Math.min(180, Math.round(spec.rotation))) } : {}),
  };
  const accentColor = accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : null;
  // The caller's brand accent only replaces slots the design marked as 'accent'.
  const useAccent = Boolean(accentColor) && spec.color === 'accent';
  const color = useAccent ? accentColor! : resolveColor(spec.color, palette, palette.ink);

  if (spec.kind === 'heading' || spec.kind === 'text') {
    const level = spec.kind === 'heading' ? (spec.level ?? 1) : undefined;
    const shared = {
      id,
      text: spec.text.slice(0, 12_000),
      align: spec.align ?? 'left',
      color,
      bg: spec.bg ? resolveColor(spec.bg, palette, palette.soft) : null,
      bold: spec.bold ?? (spec.kind === 'heading'),
      italic: spec.italic ?? false,
      underline: spec.underline ?? false,
      fontFamily: spec.font ? TEMPLATE_FONT_FAMILIES[spec.font] : undefined,
      fontSize: spec.fontSize ? clampFontSize(spec.fontSize) : undefined,
      geometry,
      ...(spec.opacity !== undefined ? { opacity: Math.max(0, Math.min(1, spec.opacity)) } : {}),
    };
    // Contrast ladder: the authored colour wins when it reads; otherwise the
    // palette provides readable accent/ink/paper variants. Shared.bg is the
    // raw chip fill; the effective background includes any shape beneath.
    const self = shared as ContentDocBlock;
    const elementBg = effectiveTextBackground(built, built.length, shared.bg ?? null, pageEffectiveBg, self);
    const authoredRole = spec.color ?? 'ink';
    const candidates = [color];
    if (authoredRole === 'accent' || authoredRole === 'accentText') candidates.push(palette.accentText);
    candidates.push(palette.onAccent, palette.ink, palette.paper);
    const resolvedTextColor = pickReadable([...new Set(candidates)], elementBg, shared.fontSize, Boolean(shared.bold));
    // Opacity floor: faded captions must still read. Keep the authored fade
    // when it passes; otherwise raise opacity to the smallest passing step.
    const authoredOpacity = spec.opacity ?? 1;
    let resolvedOpacity = authoredOpacity;
    if (contrastRatio(mixOver(resolvedTextColor, elementBg, resolvedOpacity), elementBg) < requiredRatio(shared.fontSize, Boolean(shared.bold))) {
      for (let op = Math.max(0.55, authoredOpacity); op <= 1; op += 0.05) {
        resolvedOpacity = Math.min(1, op);
        if (contrastRatio(mixOver(resolvedTextColor, elementBg, resolvedOpacity), elementBg) >= requiredRatio(shared.fontSize, Boolean(shared.bold))) break;
        resolvedOpacity = 1;
      }
    }
    if (spec.kind === 'heading') {
      return { ...shared, type: 'heading', level: level as 1 | 2 | 3, fontSize: shared.fontSize ?? clampFontSize(spec.kind === 'heading' ? 36 : 16), color: resolvedTextColor, ...(resolvedOpacity !== authoredOpacity ? { opacity: resolvedOpacity } : {}) };
    }
    return { ...shared, type: 'text', size: 'md', fontSize: shared.fontSize ?? 16, color: resolvedTextColor, ...(resolvedOpacity !== authoredOpacity ? { opacity: resolvedOpacity } : {}) };
  }

  if (spec.kind === 'button') {
    const buttonFill = useAccent ? accentColor! : resolveColor(spec.color, palette, palette.accent);
    const labelCandidates = [palette.onAccent, '#ffffff', '#111111'];
    const label = pickReadable([...new Set(labelCandidates)], buttonFill, 18, true);
    return {
      id,
      type: 'button',
      text: spec.text.slice(0, 12_000),
      href: null,
      color: buttonFill,
      textColor: label,
      align: spec.align ?? 'center',
      width: 100,
      geometry,
      ...(spec.opacity !== undefined ? { opacity: Math.max(0, Math.min(1, spec.opacity)) } : {}),
    };
  }

  // Shape: native primitive or library vector art (independently editable).
  if (spec.kind !== 'shape') throw new Error(`Unhandled template block kind`);
  const shapeColor = resolveColor(spec.color, palette, palette.accent);
  const art = spec.art ? templateArtById(spec.art) : null;
  if (art) {
    const stroke = Boolean(spec.artStroke);
    return {
      id,
      type: 'shape',
      shape: spec.shape ?? 'rectangle',
      color: useAccent ? accentColor! : shapeColor,
      align: 'left',
      width: 100,
      height: Math.max(24, Math.min(480, Math.round(geometry.h))),
      svgPath: art.d,
      svgBounds: { x: 0, y: 0, w: art.w, h: art.h },
      svgMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      svgFillNone: stroke,
      ...(stroke ? { svgStroke: shapeColor } : {}),
      svgStrokeWidth: stroke ? Math.max(2, Math.round(art.w / 12)) : undefined,
      geometry,
      ...(spec.opacity !== undefined ? { opacity: Math.max(0, Math.min(1, spec.opacity)) } : {}),
    } as ContentDocBlock;
  }
  return {
    id,
    type: 'shape',
    shape: spec.shape ?? 'rectangle',
    color: useAccent ? accentColor! : shapeColor,
    align: 'left',
    width: 100,
    height: Math.max(24, Math.min(480, Math.round(geometry.h))),
    geometry,
    ...(spec.opacity !== undefined ? { opacity: Math.max(0, Math.min(1, spec.opacity)) } : {}),
  };
}

export function buildTemplatePageSpec(page: TemplatePageSpec, pageIndex: number, templateId: string, palette: TemplatePalette, accent: string | null): ContentDocPage {
  // Worst-case gradient midpoint; else the resolved page background. Computed
  // BEFORE building so the contrast ladder sees the real, palette-merged bg.
  const pageEffectiveBg = page.gradient ? mixHex(page.gradient.from, page.gradient.to, 0.5) : (page.bg ?? palette.bg);
  return {
    id: `tp-${hashId(`${templateId}|page|${pageIndex}`)}`,
    size: page.size,
    ...(page.bg || palette.bg !== '#ffffff' ? { bg: page.bg ?? palette.bg } : {}),
    ...(page.gradient ? { gradient: page.gradient } : {}),
    blocks: page.blocks.slice(0, 40).reduce<ContentDocBlock[]>((built, spec, index) => {
      built.push(buildBlock(spec, index, pageIndex, templateId, palette, accent, pageEffectiveBg, built));
      return built;
    }, []),
  };
}

/** Build every page of a template as schema-valid Studio content. */
export function buildTemplatePages(definition: TemplateDefinition, palette: TemplatePalette, accent: string | null = null): ContentDocPage[] {
  return definition.pages.map((page, pageIndex) => buildTemplatePageSpec(page, pageIndex, definition.id, palette, accent));
}

export function buildTemplateDocument(definition: TemplateDefinition, palette: TemplatePalette, accent: string | null = null): ContentDocument {
  return {
    kind: 'uptrendify-doc',
    version: 1,
    mode: 'free',
    pages: buildTemplatePages(definition, palette, accent),
  };
}

/**
 * Structural fingerprint for the uniqueness audit: geometry quantised to 16px
 * buckets, colour ROLES (not resolved colours) so palette-only swaps cannot
 * disguise identical compositions, and text length buckets so copy swaps alone
 * cannot either. Two templates with equal fingerprints are flagged by the
 * catalogue audit unless the deviation is explicitly justified.
 */
function fingerprintPage(page: TemplatePageSpec): string {
  const dims = CONTENT_PAGE_SIZES[page.size];
  const parts = page.blocks
    .map((block) => {
      const q = (value: number, scale: number) => Math.round((value / scale) * 8);
      const role = (color: string | undefined) => (color && color.startsWith('#') ? 'hex' : color ?? '-');
      const textLen = 'text' in block && block.text ? Math.min(7, Math.floor(block.text.length / 24)) : 0;
      const fontSize = 'fontSize' in block && block.fontSize ? Math.round(block.fontSize / 6) : 0;
      const shape = block.kind === 'shape' ? `${block.shape ?? 'rect'}:${block.art ?? '-'}` : block.kind;
      return [
        block.kind === 'shape' ? 'shape' : block.kind,
        shape,
        q(block.x, dims.width), q(block.y, dims.height), q(block.w, dims.width), q(block.h, dims.height),
        block.rotation ? Math.round(block.rotation / 15) : 0,
        role(block.color),
        textLen,
        fontSize,
        'align' in block && block.align ? block.align : '-',
      ].join(',');
    })
    .sort();
  return `${page.size}|${page.gradient ? 'grad' : 'flat'}|${parts.join(';')}`;
}

export function templateFingerprints(definition: TemplateDefinition): string[] {
  return definition.pages.map(fingerprintPage);
}
