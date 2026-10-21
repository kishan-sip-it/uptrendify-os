import { describe, expect, it } from 'vitest';
import {
  CONTENT_PAGE_SIZES,
  contentBodyToPlainText,
  defaultPageSizeForType,
  createDocumentFromText,
  documentToPlainText,
  isContentDocumentBody,
  newBlockId,
  newPage,
  parseContentBody,
  reorderBlocks,
  serializeContentDocument,
  type ContentDocBlock,
  type ContentDocument,
} from './document';

const BLOCKS: ContentDocBlock[] = [
  { id: 'h1', type: 'heading', text: 'Launch week', level: 2, align: 'center', color: '#0a7d55', bg: null, bold: true, italic: false, underline: false },
  { id: 't1', type: 'text', text: 'Our new release ships Tuesday.', align: 'left', color: null, bg: '#f5f7fb', size: 'md', bold: false, italic: true, underline: false },
  { id: 'i1', type: 'image', url: 'https://cdn.example.com/hero.png', alt: 'Hero', align: 'center', width: 80 },
  { id: 's1', type: 'shape', shape: 'star', color: '#0a7d55', align: 'center', width: 40, height: 120 },
  { id: 'b1', type: 'button', text: 'Read the launch notes', href: 'https://example.com/notes', color: '#0a7d55', align: 'center', width: 60 },
];

const multiPageDoc = (): ContentDocument => ({
  kind: 'uptrendify-doc',
  version: 1,
  pages: [
    { id: 'p1', size: 'a4', blocks: BLOCKS },
    { id: 'p2', size: 'story', blocks: [{ id: 't2', type: 'text', text: 'Page two copy.', align: 'center', color: null, bg: null, size: 'lg', bold: false, italic: false, underline: true }] },
  ],
});

const singlePageDoc = (): ContentDocument => ({ kind: 'uptrendify-doc', version: 1, pages: [{ id: 'p1', size: 'a4', blocks: BLOCKS }] });

describe('content document body format', () => {
  it('serializes a single-page document in the flat blocks form and re-parses it exactly', () => {
    const body = serializeContentDocument(singlePageDoc());
    expect(body).toContain('"blocks"');
    expect(body).not.toContain('"pages"');
    expect(isContentDocumentBody(body)).toBe(true);
    expect(parseContentBody(body)).toEqual(singlePageDoc());
  });

  it('serializes a multi-page document in the pages form and re-parses it exactly', () => {
    const body = serializeContentDocument(multiPageDoc());
    expect(body).toContain('"pages"');
    expect(parseContentBody(body)).toEqual(multiPageDoc());
  });

  it('parses the legacy flat blocks form written by earlier versions', () => {
    const legacy = '{"kind":"uptrendify-doc","version":1,"blocks":[{"id":"t1","type":"text","text":"Old copy","align":"left","color":null,"size":"md"}]}';
    const doc = parseContentBody(legacy);
    expect(doc?.pages).toHaveLength(1);
    const firstBlock = doc?.pages[0]?.blocks[0];
    expect(firstBlock && firstBlock.type === 'text' ? firstBlock.text : null).toBe('Old copy');
  });

  it('treats legacy plain text as a plain body, not a document', () => {
    expect(parseContentBody('Hello\n\nWorld')).toBeNull();
    expect(isContentDocumentBody('Hello')).toBe(false);
    expect(contentBodyToPlainText('Hello\n\nWorld')).toBe('Hello\n\nWorld');
  });

  it('rejects malformed documents instead of throwing', () => {
    expect(parseContentBody('{not json')).toBeNull();
    expect(parseContentBody('{"kind":"uptrendify-doc","version":1,"blocks":[]}')).toBeNull();
    expect(parseContentBody('{"kind":"other","version":1,"blocks":[]}')).toBeNull();
    expect(parseContentBody('{"kind":"uptrendify-doc","version":1,"pages":[]}')).toBeNull();
    // A javascript: image URL must not validate.
    const evil = JSON.stringify({ kind: 'uptrendify-doc', version: 1, blocks: [{ id: 'x', type: 'image', url: 'javascript:alert(1)', alt: '', align: 'left', width: null }] });
    expect(parseContentBody(evil)).toBeNull();
    // Shape kind is constrained.
    const badShape = JSON.stringify({ kind: 'uptrendify-doc', version: 1, blocks: [{ id: 's', type: 'shape', shape: 'dragon', color: null, align: 'left', width: 60, height: 100 }] });
    expect(parseContentBody(badShape)).toBeNull();
  });

  it('projects documents to plain text for previews and publishing', () => {
    const text = documentToPlainText(singlePageDoc());
    expect(text).toContain('Launch week');
    expect(text).toContain('Our new release ships Tuesday.');
    expect(text).toContain('[image: Hero]');
    expect(text).toContain('[star]');
    expect(text).toContain('[CTA: Read the launch notes]');
    expect(contentBodyToPlainText(serializeContentDocument(singlePageDoc()))).toBe(text);
    // Multi-page content keeps every page's copy in the publishing projection.
    const multi = contentBodyToPlainText(serializeContentDocument(multiPageDoc()));
    expect(multi).toContain('Page two copy.');
  });

  it('wraps legacy text into a one-page editable document', () => {
    const doc = createDocumentFromText('First paragraph.\n\nSecond paragraph.');
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]?.blocks).toHaveLength(2);
    expect(documentToPlainText(doc)).toBe('First paragraph.\n\nSecond paragraph.');
    expect(new Set(doc.pages[0]?.blocks.map((block) => block.id)).size).toBe(2);
    expect(newBlockId('text')).not.toBe(newBlockId('text'));
    expect(newPage().blocks).toEqual([]);
  });

  it('reorders blocks by list index for drag-and-drop and move controls', () => {
    const blocks = BLOCKS;
    const reordered = reorderBlocks(blocks, 3, 0);
    expect(reordered[0].type).toBe('shape');
    expect(reordered[3].type).toBe('image');
    // Out-of-range or no-op moves keep identity, so dirty checks stay stable.
    expect(reorderBlocks(blocks, 1, 1)).toBe(blocks);
    expect(reorderBlocks(blocks, -1, 0)).toBe(blocks);
    expect(reorderBlocks(blocks, 0, 99)).toBe(blocks);
  });
});

describe('canvas page sizes', () => {
  it('defaults every parsed page to A4 and preserves a chosen size', () => {
    const legacy = '{"kind":"uptrendify-doc","version":1,"blocks":[{"id":"t1","type":"text","text":"x","align":"left","color":null,"size":"md"}]}';
    expect(parseContentBody(legacy)?.pages[0]?.size).toBe('a4');
    const sized = '{"kind":"uptrendify-doc","version":1,"pageId":"p1","size":"square","blocks":[{"id":"t1","type":"text","text":"x","align":"left","color":null,"size":"md"}]}';
    expect(parseContentBody(sized)?.pages[0]?.size).toBe('square');
    const body = serializeContentDocument(multiPageDoc());
    expect(parseContentBody(body)?.pages[1]?.size).toBe('story');
  });

  it('maps content types to sensible default canvases', () => {
    expect(defaultPageSizeForType('blog_draft')).toBe('a4');
    expect(defaultPageSizeForType('email')).toBe('a4');
    expect(defaultPageSizeForType('social_post')).toBe('square');
    expect(defaultPageSizeForType('video_script')).toBe('story');
    expect(defaultPageSizeForType(undefined)).toBe('a4');
    expect(CONTENT_PAGE_SIZES.a4.width).toBeGreaterThan(CONTENT_PAGE_SIZES.a4.height === undefined ? 0 : 0);
    expect(CONTENT_PAGE_SIZES.a4.height).toBeGreaterThan(CONTENT_PAGE_SIZES.a4.width);
    expect(CONTENT_PAGE_SIZES.square.width).toBe(CONTENT_PAGE_SIZES.square.height);
  });
});
