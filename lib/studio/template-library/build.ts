import {
  CONTENT_PAGE_SIZES,
  hashId,
  type ContentDocBlock,
  type ContentDocPage,
  type ContentDocument,
} from '@/lib/content/document';
import { templateArtById } from './art';
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
  if (role === 'soft') return palette.soft;
  if (role === 'paper') return palette.paper;
  if (role === 'bg') return palette.bg;
  return /^#[0-9a-fA-F]{6}$/.test(role) ? role : fallback;
}

function blockId(templateId: string, pageIndex: number, index: number): string {
  return `t-${hashId(`${templateId}|${pageIndex}|${index}`)}`;
}

function buildBlock(spec: TemplateBlockSpec, index: number, pageIndex: number, templateId: string, palette: TemplatePalette, accent: string | null): ContentDocBlock {
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
    if (spec.kind === 'heading') {
      return { ...shared, type: 'heading', level: level as 1 | 2 | 3, fontSize: shared.fontSize ?? clampFontSize(spec.kind === 'heading' ? 36 : 16) };
    }
    return { ...shared, type: 'text', size: 'md', fontSize: shared.fontSize ?? 16 };
  }

  if (spec.kind === 'button') {
    return {
      id,
      type: 'button',
      text: spec.text.slice(0, 12_000),
      href: null,
      color: useAccent ? accentColor! : resolveColor(spec.color, palette, palette.accent),
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
  return {
    id: `tp-${hashId(`${templateId}|page|${pageIndex}`)}`,
    size: page.size,
    ...(page.bg || palette.bg !== '#ffffff' ? { bg: page.bg ?? palette.bg } : {}),
    ...(page.gradient ? { gradient: page.gradient } : {}),
    blocks: page.blocks.slice(0, 40).map((spec, index) => buildBlock(spec, index, pageIndex, templateId, palette, accent)),
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
