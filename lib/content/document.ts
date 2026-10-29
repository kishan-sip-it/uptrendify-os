import { z } from 'zod';

/**
 * Structured content document stored INSIDE content_versions.body.
 *
 * The product contract is version-pinned content: whatever the approver sees
 * must be exactly the submitted version. Rather than adding a parallel data
 * model, an edited document is persisted as the version body itself, in a
 * tagged JSON form. Legacy versions keep their plain-text body — every reader
 * (content detail, approvals preview, publishing) parses with
 * parseContentBody() and falls back to plain text, so nothing existing breaks.
 *
 * Layout: an ordered list of one or more PAGES, each holding an ordered block
 * stack (heading / text / image / shape / CTA). Single-page documents serialize
 * in the original flat `blocks` form; multi-page documents serialize `pages`.
 */

export const CONTENT_DOC_KIND = 'uptrendify-doc';
export const CONTENT_DOC_VERSION = 1;
export const CONTENT_DOC_MAX_PAGES = 10;
export const CONTENT_DOC_MAX_BLOCKS = 40;
export const CONTENT_DOC_MAX_TEXT = 12_000;

/**
 * Canvas page sizes. Width/height are the on-canvas pixel dimensions of the
 * sheet; A4 is the default for document-style content, square/portrait for
 * social formats.
 */
export const CONTENT_PAGE_SIZES = {
  a4: { label: 'A4 portrait', width: 794, height: 1123 },
  letter: { label: 'US Letter', width: 816, height: 1056 },
  square: { label: 'Square post · 1:1', width: 760, height: 760 },
  portrait: { label: 'Portrait post · 4:5', width: 760, height: 950 },
  story: { label: 'Story / Reel · 9:16', width: 760, height: 1351 },
  landscapeSocial: { label: 'Social landscape · 1.91:1', width: 1123, height: 588 },
  landscape: { label: 'A4 landscape', width: 1123, height: 794 },
  wide: { label: 'Video / presentation · 16:9', width: 1280, height: 720 },
} as const;

export const DEFAULT_CONTENT_SHAPE_COLOR = '#8b5cf6';
export const DEFAULT_CONTENT_TEXT_COLOR = '#1d2634';
export type ContentPageSizeId = keyof typeof CONTENT_PAGE_SIZES;
export const CONTENT_PAGE_SIZE_IDS = Object.keys(CONTENT_PAGE_SIZES) as ContentPageSizeId[];

/** Default canvas for a content type when no target channel is known. */
export function defaultPageSizeForType(contentType: string | null | undefined): ContentPageSizeId {
  switch (contentType) {
    case 'social_post':
    case 'ad_copy':
    case 'cta_headlines':
      return 'square';
    case 'video_script':
      return 'story';
    case 'email':
    case 'blog_outline':
    case 'blog_draft':
    case 'landing_page':
    default:
      return 'a4';
  }
}

/** Channel-specific initial canvas presets; already-saved page sizes remain user-owned. */
export function defaultPageSizeForChannel(
  contentType: string | null | undefined,
  channel: string | null | undefined,
): ContentPageSizeId {
  const type = (contentType ?? '').trim().toLowerCase();
  const target = (channel ?? '').trim().toLowerCase();

  if (['blog_outline', 'blog_draft', 'landing_page', 'email'].includes(type)) return 'a4';
  if (['email', 'newsletter', 'blog', 'website', 'landing_page', 'pr', 'print', 'sms'].includes(target)) return 'a4';

  if (type === 'video_script') {
    if (['youtube', 'webinar', 'podcast', 'linkedin', 'linkedin_ads'].includes(target)) return 'wide';
    return 'story';
  }

  switch (target) {
    case 'instagram':
    case 'instagram_ads':
    case 'linkedin':
      return 'portrait';
    case 'linkedin_ads':
    case 'x':
    case 'google_ads':
      return 'landscapeSocial';
    case 'facebook':
    case 'facebook_ads':
    case 'meta_ads':
      return 'square';
    case 'tiktok':
      return 'story';
    case 'youtube':
    case 'webinar':
    case 'podcast':
      return 'wide';
    default:
      return defaultPageSizeForType(type);
  }
}

const align = z.enum(['left', 'center', 'right']).nullish().transform((value) => value ?? 'left');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish().transform((value) => value ?? null);
const text = z.string().max(CONTENT_DOC_MAX_TEXT);
const fontWeightSchema = z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).optional();

/**
 * Optional character-range formatting inside a text block. The owning block's
 * existing text remains canonical; concatenating run.text values must equal it.
 * Null color/background values deliberately reset that property to inheritance.
 */
const inlineTextRunSchema = z.object({
  text: z.string().max(CONTENT_DOC_MAX_TEXT),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  bg: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  fontSize: z.coerce.number().int().min(8).max(160).optional(),
  fontFamily: z.string().max(120).refine((value) => !/[;{}<>]/.test(value)).optional(),
    fontWeight: fontWeightSchema,
});
const inlineTextRuns = z.array(inlineTextRunSchema).max(512);
export type InlineTextRun = z.infer<typeof inlineTextRunSchema>;
const blockId = z.string().min(1).max(64);
const widthPct = z.coerce.number().min(20).max(100).nullish().transform((value) => (value == null ? null : Math.round(value)));
const safeUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'URL must use http(s)');

const managedStudioAssetPath = /^\/api\/brands\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/content\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const imageSource = z.string().max(2000).refine((value) => {
  if (managedStudioAssetPath.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}, 'Image source must be an http(s) URL or an authenticated Studio asset path');

const emphasis = {
  bold: z.boolean().nullish().transform((value) => value ?? false),
  italic: z.boolean().nullish().transform((value) => value ?? false),
  underline: z.boolean().nullish().transform((value) => value ?? false),
};

export const CONTENT_SHAPE_KINDS = ['rectangle', 'square', 'circle', 'triangle', 'star', 'pyramid'] as const;
const shapeKind = z.enum(CONTENT_SHAPE_KINDS);

export function headingFontSizeForLevel(level: 1 | 2 | 3): number {
  return level === 1 ? 36 : level === 2 ? 28 : 22;
}

/**
 * Font size each text size preset resolves to. Single source shared by the
 * editor canvas and the saved-document renderer (whose .size-* CSS rules must
 * match these values), so a preset renders identically everywhere.
 */
export const TEXT_SIZE_PRESET_FONT_SIZES: Record<'sm' | 'md' | 'lg' | 'xl', number> = { sm: 13, md: 15, lg: 18, xl: 24 };
export function textPresetFontSize(size: 'sm' | 'md' | 'lg' | 'xl'): number {
  return TEXT_SIZE_PRESET_FONT_SIZES[size];
}

const linkedField = z.enum(['title', 'cta']).optional();
const externalHref = z.string().max(2048).url().refine((value) => /^https?:\/\//i.test(value), 'Only HTTP and HTTPS links are allowed.').optional();

const geometry = z.object({
  x: z.coerce.number().min(-2000).max(4000),
  y: z.coerce.number().min(-2000).max(4000),
  w: z.coerce.number().min(24).max(4000),
  h: z.coerce.number().min(24).max(4000),
  rotation: z.coerce.number().min(-180).max(180).optional(),
});

const backgroundImage = z.object({
  src: imageSource,
  alt: z.string().max(300).nullish().transform((value) => value ?? ''),
  /** Preserve the whole source raster when it is used as a reconstruction reference. */
  fit: z.enum(['cover', 'contain']).optional(),
});

/**
 * Optional two-stop linear page background. Additive: absent on every body
 * written before this field existed, and every reader treats it as pure
 * presentation — solid `bg` remains the canonical fallback.
 */
export const pageBackgroundGradientSchema = z.object({
  from: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  to: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  angle: z.coerce.number().min(0).max(360),
});
export type PageBackgroundGradient = z.infer<typeof pageBackgroundGradientSchema>;

const svgVectorBounds = z.object({
  x: z.coerce.number().min(-100_000).max(100_000),
  y: z.coerce.number().min(-100_000).max(100_000),
  w: z.coerce.number().positive().max(100_000),
  h: z.coerce.number().positive().max(100_000),
});
const svgVectorMatrix = z.object({
  a: z.coerce.number().min(-100_000).max(100_000),
  b: z.coerce.number().min(-100_000).max(100_000),
  c: z.coerce.number().min(-100_000).max(100_000),
  d: z.coerce.number().min(-100_000).max(100_000),
  e: z.coerce.number().min(-100_000).max(100_000),
  f: z.coerce.number().min(-100_000).max(100_000),
});

const flags = {
  /** Hidden blocks are skipped by every renderer and projection. */
  hidden: z.boolean().optional(),
  /** Locked blocks render but reject edits in the editor. */
  locked: z.boolean().optional(),
  /** Per-element visual opacity; 1 is fully opaque and 0 is transparent. */
  opacity: z.coerce.number().min(0).max(1).optional(),
};

export const contentDocBlockSchema = z.discriminatedUnion('type', [
  z.object({
    id: blockId,
    type: z.literal('heading'),
    text,
    richText: inlineTextRuns.optional(),
    level: z.coerce.number().int().min(1).max(3).nullish().transform((value) => (value == null ? 2 : value) as 1 | 2 | 3),
    fontSize: z.coerce.number().int().min(8).max(160).optional(),
    fontFamily: z.string().max(120).refine((value) => !/[;{}<>]/.test(value)).optional(),
    fontWeight: fontWeightSchema,
    align,
    color,
    bg: color,
    ...emphasis,
    link: linkedField,
    href: externalHref,
    geometry: geometry.optional(),
    ...flags,
  }),
  z.object({
    id: blockId,
    type: z.literal('text'),
    text,
    richText: inlineTextRuns.optional(),
    align,
    color,
    bg: color,
    size: z.enum(['sm', 'md', 'lg', 'xl']).nullish().transform((value) => value ?? 'md'),
    fontSize: z.coerce.number().int().min(8).max(160).optional(),
    fontFamily: z.string().max(120).refine((value) => !/[;{}<>]/.test(value)).optional(),
    fontWeight: fontWeightSchema,
    ...emphasis,
    link: linkedField,
    href: externalHref,
    geometry: geometry.optional(),
    ...flags,
  }),
  z.object({
    id: blockId,
    type: z.literal('image'),
    url: imageSource,
    alt: z.string().max(300).nullish().transform((value) => value ?? ''),
    align,
    width: widthPct,
    geometry: geometry.optional(),
    ...flags,
  }),
  z.object({
    id: blockId,
    type: z.literal('shape'),
    shape: shapeKind,
    color,
    /** Optional label rendered centred inside the shape; empty/absent = no text. */
    text: z.string().max(CONTENT_DOC_MAX_TEXT).optional(),
    richText: inlineTextRuns.optional(),
    /** Label ink, independent of the shape fill colour. */
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    fontSize: z.coerce.number().int().min(8).max(160).optional(),
    fontFamily: z.string().max(120).refine((value) => !/[;{}<>]/.test(value)).optional(),
    fontWeight: fontWeightSchema,
    align,
    width: widthPct,
    height: z.coerce.number().int().min(24).max(480).nullish().transform((value) => value ?? 120),
    /** Sanitized SVG path data imported as a separately editable vector layer. */
    svgPath: z.string().max(50_000).refine((value) => !/[<>]/.test(value)).optional(),
    svgBounds: svgVectorBounds.optional(),
    svgMatrix: svgVectorMatrix.optional(),
    svgFillNone: z.boolean().optional(),
    svgStroke: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    svgStrokeWidth: z.coerce.number().min(0).max(1000).optional(),
    geometry: geometry.optional(),
    ...flags,
  }),
  z.object({
    id: blockId,
    type: z.literal('button'),
    text,
    href: safeUrl.nullish().transform((value) => value ?? null),
    color,
    /** Label colour rendered on the button fill; defaults to theme white. */
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    align,
    width: widthPct,
    link: linkedField,
    geometry: geometry.optional(),
    ...flags,
  }),
]);

export type ContentDocBlock = z.infer<typeof contentDocBlockSchema>;
export type ContentShapeKind = (typeof CONTENT_SHAPE_KINDS)[number];

const pageSize = z.enum(CONTENT_PAGE_SIZE_IDS).nullish().transform((value) => value ?? 'a4');
const savedArtworkSnapshotSchema = z.object({
  path: z.string().min(1).max(512).refine(
    (value) => !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..') && /\.(?:png|jpe?g)$/i.test(value),
  ),
  width: z.number().int().min(24).max(4800),
  height: z.number().int().min(24).max(4800),
  pixelRatio: z.number().min(1).max(3),
  mimeType: z.enum(['image/png', 'image/jpeg']),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
});
export type SavedArtworkSnapshot = z.infer<typeof savedArtworkSnapshotSchema>;

const contentDocPageSchema = z.object({
  id: blockId,
  size: pageSize,
  note: z.string().max(500).optional(),
  bg: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  gradient: pageBackgroundGradientSchema.optional(),
  backgroundImage: backgroundImage.optional(),
  /** Immutable raster snapshot for this saved page/version. */
  snapshot: savedArtworkSnapshotSchema.optional(),
  blocks: z.array(contentDocBlockSchema).max(CONTENT_DOC_MAX_BLOCKS),
});
export type ContentDocPage = z.infer<typeof contentDocPageSchema>;

export const contentDocumentSchema = z.object({
  kind: z.literal(CONTENT_DOC_KIND),
  version: z.literal(CONTENT_DOC_VERSION),
  mode: z.enum(['flow', 'free']).optional(),
  pages: z.array(contentDocPageSchema).min(1).max(CONTENT_DOC_MAX_PAGES),
});

export type ContentDocument = z.infer<typeof contentDocumentSchema>;

/**
 * Shared background resolution for every render surface (canvas, snapshot
 * export, saved-body views). Precedence: raster background image, then
 * gradient, then solid colour. Gradients are pure presentation and never
 * survive into plain-text projections.
 */
export function pageBackgroundStyles(page: {
  bg?: string;
  gradient?: PageBackgroundGradient;
  backgroundImage?: { src: string; fit?: 'cover' | 'contain' };
}): { backgroundColor: string; backgroundImage?: string; backgroundSize?: string; backgroundPosition?: string; backgroundRepeat?: string } {
  if (page.backgroundImage) {
    return {
      backgroundColor: page.bg ?? '#ffffff',
      backgroundImage: `url(${JSON.stringify(page.backgroundImage.src)})`,
      backgroundSize: page.backgroundImage.fit ?? 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  if (page.gradient) {
    const angle = Math.max(0, Math.min(360, Math.round(page.gradient.angle)));
    return { backgroundColor: page.bg ?? page.gradient.to, backgroundImage: `linear-gradient(${angle}deg, ${page.gradient.from}, ${page.gradient.to})` };
  }
  return { backgroundColor: page.bg ?? '#ffffff' };
}

const rawDocumentSchema = z.object({ kind: z.unknown(), version: z.unknown() }).passthrough();

/** Remove absent optional fields from parsed JSON so round-trips stay canonical. */
function omitUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => omitUndefinedDeep(item)) as T;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, omitUndefinedDeep(item)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

/**
 * Parse a stored version body. Accepts the current `pages` form and the
 * original flat single-page `blocks` form. Returns null for plain-text
 * (legacy) or malformed bodies — never throws.
 */
export function parseContentBody(body: string): ContentDocument | null {
  if (!body || !body.startsWith('{')) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (!rawDocumentSchema.safeParse(raw).success) return null;
  const source = raw as Record<string, unknown>;

  if (Array.isArray(source.pages)) {
    const parsed = contentDocumentSchema.safeParse({ kind: CONTENT_DOC_KIND, version: CONTENT_DOC_VERSION, mode: source.mode, backgroundImage: source.backgroundImage, pages: source.pages });
    return parsed.success ? omitUndefinedDeep(parsed.data) : null;
  }
  if (Array.isArray(source.blocks)) {
    // The flat single-page form never allowed an empty block list; treat an
    // empty array as malformed rather than as an empty page.
    if (source.blocks.length === 0) return null;
    const pageId = typeof source.pageId === 'string' && source.pageId.trim() ? source.pageId : 'page-1';
    const parsed = contentDocPageSchema.safeParse({ id: pageId, size: source.size, bg: source.bg, gradient: source.gradient, backgroundImage: source.backgroundImage, snapshot: source.snapshot, blocks: source.blocks });
    if (!parsed.success) return null;
    return omitUndefinedDeep({ kind: CONTENT_DOC_KIND, version: CONTENT_DOC_VERSION, mode: source.mode === 'free' ? 'free' as const : undefined, pages: [parsed.data] });
  }
  return null;
}

export function isContentDocumentBody(body: string): boolean {
  return parseContentBody(body) !== null;
}

/**
 * Deterministic serialization. A single page is written in the original flat
 * `blocks` form; multiple pages use the `pages` form.
 */
export function serializeContentDocument(doc: ContentDocument): string {
  const mode = doc.mode === 'free' ? { mode: 'free' } : {};
  if (doc.pages.length === 1) {
    const page = doc.pages[0]!;
    return JSON.stringify({
      kind: CONTENT_DOC_KIND, version: CONTENT_DOC_VERSION, ...mode,
      pageId: page.id, size: page.size,
      ...(page.bg ? { bg: page.bg } : {}),
      ...(page.gradient ? { gradient: page.gradient } : {}),
      ...(page.backgroundImage ? { backgroundImage: page.backgroundImage } : {}),
      ...(page.snapshot ? { snapshot: page.snapshot } : {}),
      blocks: page.blocks,
    });
  }
  return JSON.stringify({ kind: CONTENT_DOC_KIND, version: CONTENT_DOC_VERSION, ...mode, pages: doc.pages });
}

function scaledCanvasFontSize(size: number): number {
  return Math.max(8, Math.min(160, Math.round(size)));
}

/** Non-destructive channel-format preview. Free-canvas elements scale uniformly and center. */
export function fitDocumentBodyToChannelFormat(
  body: string,
  channel: string | null | undefined,
  contentType: string | null | undefined,
): string {
  const document = parseContentBody(body);
  if (!document) return body;
  // A saved raster is the visual source of truth; channel previews may scale
  // the image for display but must never reflow or stretch its underlying design.
  if (document.pages.some((page) => page.snapshot)) return body;
  const targetSize = defaultPageSizeForChannel(contentType, channel);
  if (document.pages.every((page) => page.size === targetSize)) return body;
  const target = CONTENT_PAGE_SIZES[targetSize];

  const pages = document.pages.map((page) => {
    const source = CONTENT_PAGE_SIZES[page.size ?? 'a4'];
    if (document.mode !== 'free') return { ...page, size: targetSize };
    const scale = Math.min(target.width / source.width, target.height / source.height);
    const offsetX = (target.width - source.width * scale) / 2;
    const offsetY = (target.height - source.height * scale) / 2;
    const blocks = page.blocks.map((block): ContentDocBlock => {
      const geometry = block.geometry ? {
        ...block.geometry,
        x: Math.round(block.geometry.x * scale + offsetX),
        y: Math.round(block.geometry.y * scale + offsetY),
        w: Math.max(24, Math.min(4000, Math.round(block.geometry.w * scale))),
        h: Math.max(24, Math.min(4000, Math.round(block.geometry.h * scale))),
      } : undefined;
      if (block.type === 'heading' || block.type === 'text' || block.type === 'shape') {
        const hasGeometry = Boolean(block.geometry);
        const richText = block.richText?.map((run) => ({
          ...run,
          ...(hasGeometry && run.fontSize !== undefined ? { fontSize: scaledCanvasFontSize(run.fontSize * scale) } : {}),
        }));
        return {
          ...block,
          ...(geometry ? { geometry } : {}),
          ...(hasGeometry && block.fontSize !== undefined ? { fontSize: scaledCanvasFontSize(block.fontSize * scale) } : {}),
          ...(richText ? { richText } : {}),
        } as ContentDocBlock;
      }
      return { ...block, ...(geometry ? { geometry } : {}) } as ContentDocBlock;
    });
    return { ...page, size: targetSize, blocks };
  });
  return serializeContentDocument({ ...document, pages });
}

/**
 * Tri-state highlight read-back for a selected range: true = every segment
 * carries a non-null highlight, false = none does, null = mixed (some
 * highlighted, some not — an honest toolbar must not mark it highlighted).
 */
export function inlineRangeBackgroundState(
  segments: Array<{ bg?: string | null }>,
  baseBg: string | null,
): boolean | null {
  if (!segments.length) return false;
  // Both undefined and null mean "inherit the block background" per the run
  // schema contract, so both resolve against baseBg identically.
  const values = segments.map((segment) => (segment.bg == null ? baseBg : segment.bg));
  const isHighlighted = (value: string | null | undefined) => value != null && value !== '';
  const first = values[0]!;
  if (values.every((value) => value === first)) return isHighlighted(first);
  return values.some(isHighlighted) ? null : false;
}

/** Default highlight ink for shape labels: dark text on light fills, white on dark. */
export function readableShapeInk(fillHex: string): string {
  const value = fillHex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return '#ffffff';
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#1d2634' : '#ffffff';
}

/** Shape label size follows the shape box until the user sets an explicit size. */
export function defaultShapeTextFontSize(block: { geometry?: { h: number } | null; height?: number | null }): number {
  // 14px reads well inside any default-sized shape; larger type is a choice
  // (explicit fontSize), never a surprise derived from the box height.
  void block;
  return 14;
}

/** Plain-text projection used by search, summaries and text-only publishing. */
export function documentToPlainText(doc: ContentDocument): string {
  return doc.pages
    .map((page) => page.blocks
      .filter((block) => !block.hidden)
      .map((block) => {
        if (block.type === 'heading') return block.text.trim();
        if (block.type === 'text') return block.text.trim();
        if (block.type === 'image') return block.alt ? `[image: ${block.alt}]` : '[image]';
        if (block.type === 'shape') return block.text?.trim() ? block.text.trim() : `[${block.shape}]`;
        return `[CTA: ${block.text.trim()}]`;
      })
      .filter((line) => line.length > 0)
      .join('\n\n'))
    .filter((section) => section.length > 0)
    .join('\n\n');
}

/** Body projection for any reader: structured content flattened, legacy kept as-is. */
export function contentBodyToPlainText(body: string): string {
  const doc = parseContentBody(body);
  return doc ? documentToPlainText(doc) : body;
}

let blockSequence = 0;
export function newBlockId(type: string): string {
  blockSequence = (blockSequence + 1) % 10_000;
  return `${type}-${Date.now().toString(36)}-${blockSequence.toString(36)}`;
}

/**
 * Deterministic block/page id derived from content. Used when a document is
 * DERIVED at render time (e.g. legacy plain text wrapped into blocks): the id
 * must be identical on the server and the client or hydration fails, and
 * stable across reloads or the canvas would look permanently dirty.
 * Interactive (user-added) blocks keep timestamp ids from newBlockId.
 */
export function hashId(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Reorder blocks by list index (drag-and-drop from the layer list or the
 * move up/down controls). Returns the same array when the move is a no-op so
 * callers can keep identity-based dirty checks stable.
 */
export function reorderBlocks<T>(blocks: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return blocks;
  if (fromIndex < 0 || fromIndex >= blocks.length) return blocks;
  if (toIndex < 0 || toIndex >= blocks.length) return blocks;
  const next = [...blocks];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Update a block in the page that owns it, starting from the latest pages
 * array. A preferred page disambiguates duplicate IDs in older saved docs.
 */
export function updateBlockInPages(
  pages: ContentDocPage[],
  blockId: string,
  transform: (block: ContentDocBlock) => ContentDocBlock,
  preferredPageIndex = 0,
): ContentDocPage[] {
  const preferred = pages[preferredPageIndex];
  const pageIndex = preferred?.blocks.some((block) => block.id === blockId)
    ? preferredPageIndex
    : pages.findIndex((page) => page.blocks.some((block) => block.id === blockId));
  if (pageIndex < 0) return pages;

  let changed = false;
  const next = pages.map((page, index) => {
    if (index !== pageIndex) return page;
    return {
      ...page,
      snapshot: undefined,
      blocks: page.blocks.map((block) => {
        if (block.id !== blockId) return block;
        changed = true;
        return transform(block);
      }),
    };
  });
  return changed ? next : pages;
}

/** Wrap legacy plain text into a one-page editable document. */
export function createDocumentFromText(body: string, pageSize: ContentPageSizeId = 'a4'): ContentDocument {
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  // New text defaults to pure black ink (an explicit colour, so the dim
  // saved-document fallback for legacy null-colour blocks stays untouched).
  const blocks: ContentDocBlock[] = (paragraphs.length > 0 ? paragraphs : ['']).map((paragraph, index) => ({
    id: `text-${index}-${hashId(`${index}|${paragraph}`)}`,
    type: 'text' as const,
    text: paragraph.slice(0, CONTENT_DOC_MAX_TEXT),
    align: 'left' as const,
    color: '#000000',
    bg: null,
    size: 'md' as const,
    bold: false,
    italic: false,
    underline: false,
  }));
  return {
    kind: CONTENT_DOC_KIND,
    version: CONTENT_DOC_VERSION,
    pages: [{ id: `page-0-${hashId(`page|${pageSize}|${body.slice(0, 256)}`)}`, size: pageSize, blocks: blocks.slice(0, CONTENT_DOC_MAX_BLOCKS) }],
  };
}

export function newPage(pageSize: ContentPageSizeId = 'a4'): ContentDocPage {
  return { id: newBlockId('page'), size: pageSize, blocks: [] };
}

/**
 * Duplicate a page into a different canvas size with content-aware reflow:
 * text steps its size by the smaller dimension ratio (clamped to the size
 * scale), everything else keeps relative widths. The source page is untouched.
 */
export function reflowPage(page: ContentDocPage, toSize: ContentPageSizeId): ContentDocPage {
  const from = CONTENT_PAGE_SIZES[page.size ?? 'a4'];
  const to = CONTENT_PAGE_SIZES[toSize];
  const ratio = Math.min(to.width / from.width, to.height / from.height);
  const step = (size: 'sm' | 'md' | 'lg' | 'xl'): 'sm' | 'md' | 'lg' | 'xl' => {
    if (ratio >= 1.2) return size === 'sm' ? 'md' : size === 'md' ? 'lg' : 'xl';
    if (ratio <= 0.8) return size === 'xl' ? 'lg' : size === 'lg' ? 'md' : 'sm';
    return size;
  };
  return {
    id: newBlockId('page'),
    size: toSize,
    // Duplicated pages are independent editing surfaces with unique layer IDs.
    blocks: page.blocks.map((block) => {
      const id = newBlockId(block.type);
      if (block.type === 'text') return { ...block, id, size: step(block.size) };
      if (block.type === 'heading') return { ...block, id, level: ratio <= 0.8 ? Math.min(3, block.level + 1) as 1 | 2 | 3 : Math.max(1, block.level - 1) as 1 | 2 | 3 };
      return { ...block, id };
    }),
  };
}

/** Resolve a block's displayed text, honouring linked content fields. */
export function resolveBlockText(
  block: { type: string; text: string; link?: 'title' | 'cta' | null },
  linked: { title?: string | null; cta?: string | null } | undefined,
): string {
  if (block.link === 'title' && linked?.title) return linked.title;
  if (block.link === 'cta' && linked?.cta) return linked.cta;
  return block.text;
}
