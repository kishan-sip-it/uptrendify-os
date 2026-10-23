import { describe, expect, it } from 'vitest';
import {
  CONTENT_PAGE_SIZES,
  contentBodyToPlainText,
  defaultPageSizeForType,
  defaultPageSizeForChannel,
  fitDocumentBodyToChannelFormat,
  reflowPage,
  updateBlockInPages,
  createDocumentFromText,
  documentToPlainText,
  isContentDocumentBody,
  newBlockId,
  newPage,
  parseContentBody,
  reorderBlocks,
  serializeContentDocument,
  type ContentDocBlock,
  type ContentDocPage,
  type ContentDocument,
  headingFontSizeForLevel,
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
  it('round-trips opacity for every block type and rejects out-of-range values', () => {
    const original = singlePageDoc();
    const opacityDoc: ContentDocument = {
      ...original,
      mode: 'free',
      pages: original.pages.map((page) => ({
        ...page,
        blocks: page.blocks.map((block) => ({ ...block, opacity: 0.35 })),
      })),
    };
    const body = serializeContentDocument(opacityDoc);
    expect(parseContentBody(body)).toEqual(opacityDoc);

    const raw = JSON.parse(body) as { blocks: Array<Record<string, unknown>> };
    raw.blocks[0]!.opacity = 1.01;
    expect(parseContentBody(JSON.stringify(raw))).toBeNull();
    raw.blocks[0]!.opacity = -0.01;
    expect(parseContentBody(JSON.stringify(raw))).toBeNull();
  });

  it('round-trips external links for text and heading and rejects unsafe protocols', () => {
    const original: ContentDocument = {
      kind: 'uptrendify-doc',
      version: 1,
      mode: 'free',
      pages: [{
        id: 'linked-page',
        size: 'square',
        blocks: [
          { id: 'linked-heading', type: 'heading', text: 'Open homepage', level: 2, align: 'left', color: '#111111', bg: null, bold: false, italic: false, underline: false, href: 'https://example.com/' },
          { id: 'linked-text', type: 'text', text: 'Read details', align: 'left', color: null, bg: null, size: 'md', bold: false, italic: false, underline: false, href: 'http://example.com/details' },
        ],
      }],
    };
    expect(parseContentBody(serializeContentDocument(original))).toEqual(original);
    const unsafe = JSON.parse(serializeContentDocument(original)) as { blocks: Array<Record<string, unknown>> };
    unsafe.blocks[0]!.href = 'javascript:alert(1)';
    expect(parseContentBody(JSON.stringify(unsafe))).toBeNull();
  });

  it('maps heading levels to visibly distinct sizes', () => {
    expect(headingFontSizeForLevel(1)).toBe(36);
    expect(headingFontSizeForLevel(2)).toBe(28);
    expect(headingFontSizeForLevel(3)).toBe(22);
  });

  it('round-trips independent geometry, numeric typography, and a page background image', () => {
    const doc: ContentDocument = {
      kind: 'uptrendify-doc',
      version: 1,
      mode: 'free',
      pages: [{
        id: 'free-page',
        size: 'square',
        backgroundImage: { src: 'https://cdn.example.com/background.png', alt: 'Background', fit: 'contain' },
        blocks: [
          { id: 'free-heading', type: 'heading', text: 'Canvas title', level: 1, align: 'left', color: '#112233', bg: null, bold: true, italic: false, underline: false, fontSize: 54, fontFamily: 'Georgia', geometry: { x: 30, y: 44, w: 520, h: 128 } },
          { id: 'free-text', type: 'text', text: 'Independently resizable copy', align: 'left', color: null, bg: '#f5f5f5', size: 'md', bold: false, italic: false, underline: false, fontSize: 19, fontFamily: 'Arial', geometry: { x: 42, y: 220, w: 360, h: 92 } },
        ],
      }],
    };
    const body = serializeContentDocument(doc);
    expect(parseContentBody(body)).toEqual(doc);
  });

  it('accepts same-origin uploaded Studio asset paths and rejects unsafe image sources', () => {
    const assetPath = '/api/brands/11111111-1111-4111-8111-111111111111/content/22222222-2222-4222-8222-222222222222/assets/33333333-3333-4333-8333-333333333333';
    const doc: ContentDocument = {
      kind: 'uptrendify-doc',
      version: 1,
      mode: 'free',
      pages: [{
        id: 'page-1',
        size: 'square',
        backgroundImage: { src: assetPath, alt: '' },
        blocks: [{ id: 'image-1', type: 'image', url: assetPath, alt: 'Uploaded image', align: 'center', width: 80, geometry: { x: 20, y: 30, w: 400, h: 300 } }],
      }],
    };
    expect(parseContentBody(serializeContentDocument(doc))).toEqual(doc);
    const unsafe = serializeContentDocument({
      ...doc,
      pages: [{ ...doc.pages[0]!, backgroundImage: { src: 'javascript:alert(1)', alt: '' } }],
    });
    expect(parseContentBody(unsafe)).toBeNull();
  });

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

  it('maps content types and channels to the intended canvas aspect ratios', () => {
    expect(defaultPageSizeForType('blog_draft')).toBe('a4');
    expect(defaultPageSizeForType('email')).toBe('a4');
    expect(defaultPageSizeForType('social_post')).toBe('square');
    expect(defaultPageSizeForType('video_script')).toBe('story');
    expect(defaultPageSizeForType(undefined)).toBe('a4');
    expect(defaultPageSizeForChannel('social_post', 'instagram')).toBe('portrait');
    expect(defaultPageSizeForChannel('video_script', 'instagram')).toBe('story');
    expect(defaultPageSizeForChannel('social_post', 'linkedin_ads')).toBe('landscapeSocial');
    expect(defaultPageSizeForChannel('video_script', 'youtube')).toBe('wide');
    expect(defaultPageSizeForChannel('blog_draft', 'instagram')).toBe('a4');
    expect(CONTENT_PAGE_SIZES.a4.height).toBeGreaterThan(CONTENT_PAGE_SIZES.a4.width);
    expect(CONTENT_PAGE_SIZES.square.width).toBe(CONTENT_PAGE_SIZES.square.height);
    expect(CONTENT_PAGE_SIZES.portrait.width / CONTENT_PAGE_SIZES.portrait.height).toBeCloseTo(4 / 5, 2);
    expect(CONTENT_PAGE_SIZES.story.width / CONTENT_PAGE_SIZES.story.height).toBeCloseTo(9 / 16, 2);
    expect(CONTENT_PAGE_SIZES.landscapeSocial.width / CONTENT_PAGE_SIZES.landscapeSocial.height).toBeCloseTo(1.91, 1);
  });

  it('updates the requested page when legacy duplicate block IDs exist', () => {
    const first: ContentDocBlock = {
      id: 'shared-legacy-id', type: 'text', text: 'Page one stays intact',
      align: 'left', color: null, bg: null, size: 'md',
      bold: false, italic: false, underline: false,
    };
    const second: ContentDocBlock = { ...first, text: 'Page two content' };
    const pages = [
      { id: 'page-one', size: 'square' as const, blocks: [first] },
      { id: 'page-two', size: 'portrait' as const, blocks: [second] },
    ];
    const updated = updateBlockInPages(
      pages,
      'shared-legacy-id',
      (block) => ({ ...block, text: 'Edited on page two' } as ContentDocBlock),
      1,
    );
    const pageOneBlock = updated[0]!.blocks[0]!;
    const pageTwoBlock = updated[1]!.blocks[0]!;
    expect(pageOneBlock.type === 'text' ? pageOneBlock.text : null).toBe('Page one stays intact');
    expect(pageTwoBlock.type === 'text' ? pageTwoBlock.text : null).toBe('Edited on page two');
  });

  it('duplicates a page with independent block IDs', () => {
    const source: ContentDocPage = {
      id: 'source-page',
      size: 'square',
      blocks: [
        { id: 'source-heading', type: 'heading', text: 'Headline', level: 2, align: 'left', color: null, bg: null, bold: false, italic: false, underline: false },
        { id: 'source-text', type: 'text', text: 'Caption', align: 'left', color: null, bg: null, size: 'md', bold: false, italic: false, underline: false },
      ],
    };
    const copied = reflowPage(source, 'portrait');
    expect(copied.id).not.toBe(source.id);
    expect(copied.blocks.map((block) => block.id)).not.toEqual(source.blocks.map((block) => block.id));
    expect(new Set([...source.blocks, ...copied.blocks].map((block) => block.id)).size).toBe(4);
    expect(copied.blocks.map((block) => block.type)).toEqual(source.blocks.map((block) => block.type));
  });

  it('fits a preview copy to the selected channel without changing the saved body', () => {
    const original: ContentDocument = {
      kind: 'uptrendify-doc',
      version: 1,
      mode: 'free',
      pages: [{
        id: 'fit-page',
        size: 'letter',
        blocks: [{
          id: 'fit-heading',
          type: 'heading',
          text: 'Do not crop me',
          level: 2,
          align: 'left',
          color: '#111111',
          bg: null,
          bold: true,
          italic: false,
          underline: false,
          fontSize: 40,
          richText: [{ text: 'Do not crop me', fontSize: 40 }],
          geometry: { x: 80, y: 120, w: 600, h: 120 },
        }],
      }],
    };
    const savedBody = serializeContentDocument(original);
    const fitted = parseContentBody(fitDocumentBodyToChannelFormat(savedBody, 'instagram', 'social_post'));
    expect(fitted?.pages[0]?.size).toBe('portrait');
    expect(fitted?.pages[0]?.blocks[0]?.geometry?.w).toBeLessThan(600);
    const heading = fitted?.pages[0]?.blocks[0];
    expect(heading?.type === 'heading' ? heading.fontSize : null).toBeLessThan(40);
    expect(parseContentBody(savedBody)).toEqual(original);
  });
});
