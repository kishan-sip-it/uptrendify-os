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
  square: { label: 'Square post', width: 760, height: 760 },
  story: { label: 'Story 9:16', width: 760, height: 1351 },
} as const;
export type ContentPageSizeId = keyof typeof CONTENT_PAGE_SIZES;
export const CONTENT_PAGE_SIZE_IDS = Object.keys(CONTENT_PAGE_SIZES) as ContentPageSizeId[];

/** Default canvas for a content type. Falls back to A4. */
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

const align = z.enum(['left', 'center', 'right']).nullish().transform((value) => value ?? 'left');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish().transform((value) => value ?? null);
const text = z.string().max(CONTENT_DOC_MAX_TEXT);
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
  }, 'Image source must be an http(s) URL');

const emphasis = {
  bold: z.boolean().nullish().transform((value) => value ?? false),
  italic: z.boolean().nullish().transform((value) => value ?? false),
  underline: z.boolean().nullish().transform((value) => value ?? false),
};

export const CONTENT_SHAPE_KINDS = ['rectangle', 'square', 'circle', 'triangle', 'star', 'pyramid'] as const;
const shapeKind = z.enum(CONTENT_SHAPE_KINDS);

export const contentDocBlockSchema = z.discriminatedUnion('type', [
  z.object({
    id: blockId,
    type: z.literal('heading'),
    text,
    level: z.coerce.number().int().min(1).max(3).nullish().transform((value) => (value == null ? 2 : value) as 1 | 2 | 3),
    align,
    color,
    bg: color,
    ...emphasis,
  }),
  z.object({
    id: blockId,
    type: z.literal('text'),
    text,
    align,
    color,
    bg: color,
    size: z.enum(['sm', 'md', 'lg', 'xl']).nullish().transform((value) => value ?? 'md'),
    ...emphasis,
  }),
  z.object({
    id: blockId,
    type: z.literal('image'),
    url: safeUrl,
    alt: z.string().max(300).nullish().transform((value) => value ?? ''),
    align,
    width: widthPct,
  }),
  z.object({
    id: blockId,
    type: z.literal('shape'),
    shape: shapeKind,
    color,
    align,
    width: widthPct,
    height: z.coerce.number().int().min(24).max(480).nullish().transform((value) => value ?? 120),
  }),
  z.object({
    id: blockId,
    type: z.literal('button'),
    text,
    href: safeUrl.nullish().transform((value) => value ?? null),
    color,
    align,
    width: widthPct,
  }),
]);

export type ContentDocBlock = z.infer<typeof contentDocBlockSchema>;
export type ContentShapeKind = (typeof CONTENT_SHAPE_KINDS)[number];

const pageSize = z.enum(CONTENT_PAGE_SIZE_IDS).nullish().transform((value) => value ?? 'a4');
const contentDocPageSchema = z.object({
  id: blockId,
  size: pageSize,
  blocks: z.array(contentDocBlockSchema).max(CONTENT_DOC_MAX_BLOCKS),
});
export type ContentDocPage = z.infer<typeof contentDocPageSchema>;

export const contentDocumentSchema = z.object({
  kind: z.literal(CONTENT_DOC_KIND),
  version: z.literal(CONTENT_DOC_VERSION),
  pages: z.array(contentDocPageSchema).min(1).max(CONTENT_DOC_MAX_PAGES),
});

export type ContentDocument = z.infer<typeof contentDocumentSchema>;

const rawDocumentSchema = z.object({ kind: z.unknown(), version: z.unknown() }).passthrough();

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
    const parsed = contentDocumentSchema.safeParse({ kind: CONTENT_DOC_KIND, version: CONTENT_DOC_VERSION, pages: source.pages });
    return parsed.success ? parsed.data : null;
  }
  if (Array.isArray(source.blocks)) {
    // The flat single-page form never allowed an empty block list; treat an
    // empty array as malformed rather than as an empty page.
    if (source.blocks.length === 0) return null;
    const pageId = typeof source.pageId === 'string' && source.pageId.trim() ? source.pageId : 'page-1';
    const parsed = contentDocPageSchema.safeParse({ id: pageId, size: source.size, blocks: source.blocks });
    if (!parsed.success) return null;
    return { kind: CONTENT_DOC_KIND, version: CONTENT_DOC_VERSION, pages: [parsed.data] };
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
  if (doc.pages.length === 1) {
    const page = doc.pages[0]!;
    return JSON.stringify({ kind: CONTENT_DOC_KIND, version: CONTENT_DOC_VERSION, pageId: page.id, size: page.size, blocks: page.blocks });
  }
  return JSON.stringify({ kind: CONTENT_DOC_KIND, version: CONTENT_DOC_VERSION, pages: doc.pages });
}

/** Plain-text projection used by search, summaries and text-only publishing. */
export function documentToPlainText(doc: ContentDocument): string {
  return doc.pages
    .map((page) => page.blocks
      .map((block) => {
        if (block.type === 'heading') return block.text.trim();
        if (block.type === 'text') return block.text.trim();
        if (block.type === 'image') return block.alt ? `[image: ${block.alt}]` : '[image]';
        if (block.type === 'shape') return `[${block.shape}]`;
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

/** Wrap legacy plain text into a one-page editable document. */
export function createDocumentFromText(body: string, pageSize: ContentPageSizeId = 'a4'): ContentDocument {
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const blocks: ContentDocBlock[] = (paragraphs.length > 0 ? paragraphs : ['']).map((paragraph) => ({
    id: newBlockId('text'),
    type: 'text' as const,
    text: paragraph.slice(0, CONTENT_DOC_MAX_TEXT),
    align: 'left' as const,
    color: null,
    bg: null,
    size: 'md' as const,
    bold: false,
    italic: false,
    underline: false,
  }));
  return {
    kind: CONTENT_DOC_KIND,
    version: CONTENT_DOC_VERSION,
    pages: [{ id: newBlockId('page'), size: pageSize, blocks: blocks.slice(0, CONTENT_DOC_MAX_BLOCKS) }],
  };
}

export function newPage(pageSize: ContentPageSizeId = 'a4'): ContentDocPage {
  return { id: newBlockId('page'), size: pageSize, blocks: [] };
}
