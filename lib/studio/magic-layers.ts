/**
 * Magic Layers — reconstruct an editable Studio composition from a flattened
 * design image.
 *
 * This module is the shared, pure core used by BOTH sides of the feature:
 *   - the API route validates and normalizes the AI element plan here before
 *     returning it to the client;
 *   - the editor applies user corrections, verifies colour claims against the
 *     actual pixels, and builds the final ContentDocPage here.
 *
 * Everything is deterministic and side-effect free so the whole reconstruction
 * contract is unit-testable without any AI provider.
 *
 * Coordinate convention (identical to the existing raster-text recognition):
 * element bounds are normalized to 0..1000 across the full source image;
 * fontSize values are expressed in 1000-units of image height.
 */

import { z } from 'zod';
import {
  CONTENT_DOC_MAX_BLOCKS,
  CONTENT_PAGE_SIZES,
  hashId,
  type ContentDocBlock,
  type ContentDocPage,
  type ContentPageSizeId,
  type ContentShapeKind,
} from '@/lib/content/document';

export const MAGIC_LAYERS_MAX_ELEMENTS = 24;
/** Elements below this confidence start UNSELECTED in the review dialog. */
export const MAGIC_LAYERS_DEFAULT_SELECT_CONFIDENCE = 0.5;
/** A recovered box smaller than this (in 0..1000 units) cannot map to the
 * 24px minimum block geometry honestly — drop it instead of clamping a lie. */
export const MAGIC_LAYERS_MIN_BOX_UNITS = 8;
/** Recovered element boxes may together cover at most this fraction of the
 * image; beyond that the "background" was probably classified as elements. */
export const MAGIC_LAYERS_MAX_COVERAGE = 0.95;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const bounds = z.object({
  x: z.number().finite().min(0).max(1000),
  y: z.number().finite().min(0).max(1000),
  w: z.number().finite().min(1).max(1000),
  h: z.number().finite().min(1).max(1000),
});

export const MAGIC_LAYER_SHAPE_KINDS = ['rectangle', 'square', 'circle', 'triangle', 'star', 'pyramid'] as const;
export type MagicLayerShapeKind = (typeof MAGIC_LAYER_SHAPE_KINDS)[number];

const confidence = z.number().finite().min(0).max(1);

export const magicLayerTextElementSchema = z.object({
  kind: z.literal('text'),
  text: z.string().trim().min(1).max(2_000),
  bounds,
  /** Font size in 0..1000 units of image height (40 = 4% of the height). */
  fontSize: z.number().finite().min(1).max(1000),
  fontFamily: z.string().max(120).optional(),
  fontWeight: z.enum(['normal', 'bold']).optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: hexColor,
  align: z.enum(['left', 'center', 'right']),
  backgroundKind: z.enum(['solid', 'gradient', 'photo', 'unknown']).optional(),
  confidence,
});
export const magicLayerShapeElementSchema = z.object({
  kind: z.literal('shape'),
  shape: z.enum(MAGIC_LAYER_SHAPE_KINDS),
  bounds,
  fill: hexColor,
  rotation: z.number().finite().min(-180).max(180).optional(),
  confidence,
});
export const magicLayerImageElementSchema = z.object({
  kind: z.literal('image'),
  bounds,
  description: z.string().max(300).optional(),
  confidence,
});
export const magicLayerElementSchema = z.discriminatedUnion('kind', [
  magicLayerTextElementSchema,
  magicLayerShapeElementSchema,
  magicLayerImageElementSchema,
]);

export const magicLayerBackgroundSchema = z.object({
  kind: z.enum(['solid', 'gradient', 'photo', 'unknown']),
  color: hexColor.nullable().optional(),
  gradient: z.object({ from: hexColor, to: hexColor, angle: z.number().finite().min(0).max(360) }).nullable().optional(),
});

export const magicLayerPlanSchema = z.object({
  background: magicLayerBackgroundSchema,
  /** Painting order: FIRST element is the BOTTOM layer. */
  elements: z.array(magicLayerElementSchema).max(CONTENT_DOC_MAX_BLOCKS),
  notes: z.array(z.string().max(240)).max(8).optional(),
});

export type MagicLayerElement = z.infer<typeof magicLayerElementSchema>;
export type MagicLayerTextElement = z.infer<typeof magicLayerTextElementSchema>;
export type MagicLayerShapeElement = z.infer<typeof magicLayerShapeElementSchema>;
export type MagicLayerImageElement = z.infer<typeof magicLayerImageElementSchema>;
export type MagicLayerBackground = z.infer<typeof magicLayerBackgroundSchema>;
export type MagicLayerPlan = z.infer<typeof magicLayerPlanSchema>;

/**
 * Server-side normalization of a raw model plan. Never throws: unsafe or
 * unrecoverable entries are DROPPED and reported, because a partial honest
 * reconstruction beats a rejected or fabricated one. Order is preserved
 * (painting order is the layer order).
 */
export function validateMagicLayerPlan(plan: MagicLayerPlan): { plan: MagicLayerPlan; dropped: string[] } {
  const dropped: string[] = [];
  const boxKey = (element: MagicLayerElement) =>
    `${Math.round(element.bounds.x)},${Math.round(element.bounds.y)},${Math.round(element.bounds.w)},${Math.round(element.bounds.h)}`;
  // One pass, in place: a duplicate box keeps the MORE CONFIDENT element in
  // the original painting-order slot of its twin.
  const keptByKey = new Map<string, MagicLayerElement>();
  const order: string[] = [];
  for (const element of plan.elements) {
    if (element.bounds.w < MAGIC_LAYERS_MIN_BOX_UNITS || element.bounds.h < MAGIC_LAYERS_MIN_BOX_UNITS) {
      dropped.push(`Dropped a ${element.kind} region too small to edit honestly (${Math.round(element.bounds.w)}×${Math.round(element.bounds.h)} units).`);
      continue;
    }
    if (element.bounds.x + element.bounds.w > 1000 || element.bounds.y + element.bounds.h > 1000) {
      dropped.push(`Dropped a ${element.kind} region that extended beyond the image.`);
      continue;
    }
    const key = boxKey(element);
    const existing = keptByKey.get(key);
    if (!existing) {
      keptByKey.set(key, element);
      order.push(key);
      continue;
    }
    if (element.confidence > existing.confidence) {
      keptByKey.set(key, element);
    }
    dropped.push('Dropped a duplicate region for the same bounds.');
  }
  let elements = order.map((key) => keptByKey.get(key)!);

  if (elements.length > MAGIC_LAYERS_MAX_ELEMENTS) {
    const byConfidence = [...elements].sort((a, b) => b.confidence - a.confidence).slice(0, MAGIC_LAYERS_MAX_ELEMENTS);
    const keptIds = new Set(byConfidence);
    const removed = elements.length - MAGIC_LAYERS_MAX_ELEMENTS;
    elements = elements.filter((element) => keptIds.has(element));
    dropped.push(`Kept the ${MAGIC_LAYERS_MAX_ELEMENTS} most confident elements; dropped ${removed} lower-confidence ones.`);
  }

  // Coverage gate: if element boxes blanket the image, the background was
  // misread as elements. Shed the least confident boxes until it fits.
  const area = (element: MagicLayerElement) => element.bounds.w * element.bounds.h;
  let coverage = elements.reduce((total, element) => total + area(element), 0);
  const maxCoverage = MAGIC_LAYERS_MAX_COVERAGE * 1_000_000;
  while (coverage > maxCoverage && elements.length > 1) {
    let weakest = 0;
    for (let index = 1; index < elements.length; index += 1) {
      const current = elements[index]!;
      const weakestElement = elements[weakest]!;
      if (current.confidence < weakestElement.confidence || (current.confidence === weakestElement.confidence && area(current) > area(weakestElement))) {
        weakest = index;
      }
    }
    coverage -= area(elements[weakest]!);
    dropped.push(`Dropped a ${elements[weakest]!.kind} region: element boxes covered too much of the image.`);
    elements = elements.filter((_, index) => index !== weakest);
  }

  return { plan: { ...plan, elements }, dropped };
}

// ---------------------------------------------------------------------------
// Geometry mapping (mirrors the established raster-text import mapping).
// ---------------------------------------------------------------------------

export type ContainFitMapping = {
  size: ContentPageSizeId;
  pageWidth: number;
  pageHeight: number;
  /** Scale applied to source pixels to fit the page (≤ contain). */
  scale: number;
  offsetX: number;
  offsetY: number;
  imageWidth: number;
  imageHeight: number;
};

/** Nearest preset canvas for an arbitrary source aspect (log-ratio distance). */
export function nearestPageSizeForRatio(width: number, height: number): ContentPageSizeId {
  const ratio = width / Math.max(1, height);
  return (Object.entries(CONTENT_PAGE_SIZES) as Array<[ContentPageSizeId, { width: number; height: number }]>)
    .reduce((best, current) =>
      Math.abs(Math.log(current[1].width / current[1].height / ratio)) <
      Math.abs(Math.log(best[1].width / best[1].height / ratio)) ? current : best,
    )[0];
}

export function containFitMapping(imageWidth: number, imageHeight: number): ContainFitMapping {
  const size = nearestPageSizeForRatio(imageWidth, imageHeight);
  const dimensions = CONTENT_PAGE_SIZES[size];
  const scale = Math.min(dimensions.width / imageWidth, dimensions.height / imageHeight);
  const scaledWidth = imageWidth * scale;
  const scaledHeight = imageHeight * scale;
  return {
    size,
    pageWidth: dimensions.width,
    pageHeight: dimensions.height,
    scale,
    offsetX: (dimensions.width - scaledWidth) / 2,
    offsetY: (dimensions.height - scaledHeight) / 2,
    imageWidth: scaledWidth,
    imageHeight: scaledHeight,
  };
}

export function mapBoxToCanvasGeometry(bounds: { x: number; y: number; w: number; h: number }, mapping: ContainFitMapping) {
  const xNorm = Math.max(0, Math.min(1000, bounds.x));
  const yNorm = Math.max(0, Math.min(1000, bounds.y));
  const wNorm = Math.max(1, Math.min(1000 - xNorm, bounds.w));
  const hNorm = Math.max(1, Math.min(1000 - yNorm, bounds.h));
  return {
    x: Math.round(mapping.offsetX + xNorm * mapping.imageWidth / 1000),
    y: Math.round(mapping.offsetY + yNorm * mapping.imageHeight / 1000),
    w: Math.max(24, Math.round(wNorm * mapping.imageWidth / 1000)),
    h: Math.max(24, Math.round(hNorm * mapping.imageHeight / 1000)),
  };
}

export function canvasFontSize(fontSizeUnits: number, mapping: ContainFitMapping): number {
  return Math.max(8, Math.min(160, Math.round(fontSizeUnits * mapping.imageHeight / 1000)));
}

// ---------------------------------------------------------------------------
// Pixel verification of model colour claims (runs where the pixels live).
// ---------------------------------------------------------------------------

type RasterPixels = { width: number; height: number; data: Uint8ClampedArray };

function parseHex(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  return [
    Number.parseInt(match[1]!.slice(0, 2), 16),
    Number.parseInt(match[1]!.slice(2, 4), 16),
    Number.parseInt(match[1]!.slice(4, 6), 16),
  ];
}

function colorDistance(r: number, g: number, b: number, color: [number, number, number]): number {
  const dr = r - color[0];
  const dg = g - color[1];
  const db = b - color[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('');
}

export type SolidVerification = { verified: boolean; measured: string; matchRatio: number };

/**
 * Verify a claimed solid background against the actual border pixels. A solid
 * background claim is only trusted for the page fill when the image's own
 * border ring agrees — otherwise the cleaned raster stays the background.
 */
export function verifySolidBackground(image: RasterPixels, claimedColor: string): SolidVerification {
  const claimed = parseHex(claimedColor);
  if (!claimed) return { verified: false, measured: '#000000', matchRatio: 0 };
  const { width, height, data } = image;
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.02));
  let samples = 0;
  let matches = 0;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 4;
    if ((data[offset + 3] ?? 0) < 200) return;
    samples += 1;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    rs.push(r); gs.push(g); bs.push(b);
    if (colorDistance(r, g, b, claimed) <= 14) matches += 1;
  };
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 200))) {
    for (let y = 0; y < band; y += 1) { consider(x, y); consider(x, height - 1 - y); }
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 200))) {
    for (let x = 0; x < band; x += 1) { consider(x, y); consider(width - 1 - x, y); }
  }
  rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
  const measured = samples
    ? toHex(rs[Math.floor(rs.length / 2)] ?? 0, gs[Math.floor(gs.length / 2)] ?? 0, bs[Math.floor(bs.length / 2)] ?? 0)
    : '#000000';
  const matchRatio = samples ? matches / samples : 0;
  return { verified: samples >= 12 && matchRatio >= 0.97, measured, matchRatio };
}

/**
 * Verify a claimed solid shape fill against the region's interior. A shape
 * whose pixels disagree with the claimed flat colour is reconstructed as an
 * image cutout instead — an honest downgrade, never a fabricated vector.
 */
export function verifySolidShapeFill(image: RasterPixels, bounds: { x: number; y: number; w: number; h: number }, claimedFill: string): SolidVerification {
  const claimed = parseHex(claimedFill);
  if (!claimed) return { verified: false, measured: '#000000', matchRatio: 0 };
  const { width, height, data } = image;
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(bounds.x * width / 1000) + Math.max(1, Math.round(bounds.w * width / 1000 * 0.12))));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(bounds.y * height / 1000) + Math.max(1, Math.round(bounds.h * height / 1000 * 0.12))));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((bounds.x + bounds.w) * width / 1000) - Math.max(1, Math.round(bounds.w * width / 1000 * 0.12))));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil((bounds.y + bounds.h) * height / 1000) - Math.max(1, Math.round(bounds.h * height / 1000 * 0.12))));
  let samples = 0;
  let matches = 0;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const stepX = Math.max(1, Math.floor((x1 - x0) / 48));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 48));
  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) {
      const offset = (y * width + x) * 4;
      if ((data[offset + 3] ?? 0) < 200) continue;
      samples += 1;
      const r = data[offset] ?? 0;
      const g = data[offset + 1] ?? 0;
      const b = data[offset + 2] ?? 0;
      rs.push(r); gs.push(g); bs.push(b);
      if (colorDistance(r, g, b, claimed) <= 16) matches += 1;
    }
  }
  rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
  const measured = samples
    ? toHex(rs[Math.floor(rs.length / 2)] ?? 0, gs[Math.floor(gs.length / 2)] ?? 0, bs[Math.floor(bs.length / 2)] ?? 0)
    : '#000000';
  const matchRatio = samples ? matches / samples : 0;
  return { verified: samples >= 8 && matchRatio >= 0.95, measured, matchRatio };
}

// ---------------------------------------------------------------------------
// Document assembly.
// ---------------------------------------------------------------------------

/** A square/circle claim is only honest when the recovered box is actually
 * square; otherwise the shape degrades to a rectangle (aspect preserved). */
export function honestShapeKind(shape: MagicLayerShapeKind, bounds: { w: number; h: number }): { shape: ContentShapeKind; downgraded: boolean } {
  const aspect = bounds.w / Math.max(1, bounds.h);
  if ((shape === 'square' || shape === 'circle') && Math.abs(aspect - 1) > 0.2) {
    return { shape: 'rectangle', downgraded: true };
  }
  return { shape, downgraded: false };
}

export type MagicLayerBuildElement =
  | (Omit<MagicLayerTextElement, 'confidence' | 'backgroundKind'> & { hidden?: boolean })
  | (Omit<MagicLayerShapeElement, 'confidence'> & { renderedAs: 'native' } )
  | (Omit<MagicLayerShapeElement, 'confidence'> & { renderedAs: 'image'; url: string; description?: string })
  | (Omit<MagicLayerImageElement, 'confidence'> & { url: string; description?: string });

export type MagicLayerBuildBackground =
  | { type: 'color'; color: string }
  | { type: 'image'; src: string; alt: string };

export type MagicLayerBuildResult = {
  page: ContentDocPage;
  warnings: string[];
};

/**
 * Assemble the final editable page. Geometry follows the same contain-fit
 * mapping as the existing raster-text import, so a recovered layer lands
 * exactly where its pixels were. Blocks are appended in painting order —
 * the block array order IS the z-order on the free canvas.
 */
export function buildMagicLayerPage(input: {
  background: MagicLayerBuildBackground;
  /** Painting order (bottom first), already user-selected and verified. */
  elements: MagicLayerBuildElement[];
  imageWidth: number;
  imageHeight: number;
  /** Stable seed (source file name) for deterministic page/block ids. */
  seed: string;
}): MagicLayerBuildResult {
  const mapping = containFitMapping(input.imageWidth, input.imageHeight);
  const warnings: string[] = [];
  const blocks: ContentDocBlock[] = [];

  for (const element of input.elements) {
    if (blocks.length >= CONTENT_DOC_MAX_BLOCKS) {
      warnings.push(`Layer limit reached (${CONTENT_DOC_MAX_BLOCKS}); ${input.elements.length - blocks.length} recovered layer(s) were not added.`);
      break;
    }
    const geometry = mapBoxToCanvasGeometry(element.bounds, mapping);

    if (element.kind === 'text') {
      const fontSize = canvasFontSize(element.fontSize, mapping);
      const fontFamily = (element.fontFamily ?? 'Arial').replace(/[^a-zA-Z0-9 ,'-]/g, '').slice(0, 120) || 'Arial';
      const common = {
        id: `text-${hashId(input.seed + blocks.length + element.text)}`,
        text: element.text,
        align: element.align,
        color: element.color,
        bg: null,
        bold: element.fontWeight === 'bold',
        italic: element.italic ?? false,
        underline: element.underline ?? false,
        fontSize,
        fontFamily,
        geometry,
        opacity: 1,
      };
      if (fontSize >= 38) {
        blocks.push({
          ...common,
          type: 'heading',
          level: (fontSize >= 58 ? 1 : fontSize >= 46 ? 2 : 3) as 1 | 2 | 3,
        });
      } else {
        blocks.push({ ...common, type: 'text', size: fontSize >= 22 ? 'lg' as const : 'md' as const });
      }
      continue;
    }

    if (element.kind === 'shape' && element.renderedAs === 'native') {
      const { shape, downgraded } = honestShapeKind(element.shape, element.bounds);
      if (downgraded) warnings.push(`A recovered ${element.shape} did not have a square bounding box; it was added as a rectangle to keep its true aspect.`);
      blocks.push({
        id: `shape-${hashId(input.seed + blocks.length + shape)}`,
        type: 'shape',
        shape,
        color: element.fill,
        text: '',
        align: 'left',
        width: Math.max(20, Math.min(100, Math.round(geometry.w / mapping.pageWidth * 100))),
        height: Math.max(24, Math.min(480, Math.round(geometry.h))),
        ...(element.rotation ? { geometry: { ...geometry, rotation: element.rotation } } : { geometry }),
        opacity: 1,
      });
      continue;
    }

    // shape renderedAs 'image' (downgraded) OR a recovered image element:
    // a rectangular cutout of the ORIGINAL pixels at its original position.
    const url = element.url;
    if (!url) {
      warnings.push('A recovered image layer could not be stored and was skipped.');
      continue;
    }
    const alt = (('description' in element && element.description) || 'Recovered image layer').slice(0, 300);
    blocks.push({
      id: `image-${hashId(input.seed + blocks.length + alt)}`,
      type: 'image',
      url,
      alt,
      align: 'left',
      width: Math.max(20, Math.min(100, Math.round(geometry.w / mapping.pageWidth * 100))),
      geometry,
      opacity: 1,
    });
  }

  const page: ContentDocPage = input.background.type === 'color'
    ? {
        id: `page-${hashId(input.seed + '|magic')}`,
        size: mapping.size,
        bg: input.background.color,
        blocks,
      }
    : {
        id: `page-${hashId(input.seed + '|magic')}`,
        size: mapping.size,
        bg: '#ffffff',
        backgroundImage: { src: input.background.src, alt: input.background.alt.slice(0, 300), fit: 'contain' },
        blocks,
      };

  return { page, warnings };
}
