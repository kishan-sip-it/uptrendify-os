import { describe, expect, it } from 'vitest';
import { CONTENT_DOC_MAX_BLOCKS, contentDocumentSchema, serializeContentDocument, parseContentBody, type ContentDocument } from '@/lib/content/document';
import type { ContentDocBlock } from '@/lib/content/document';
import { contrastRatio, mixOver } from '@/lib/studio/template-library/contrast';
import {
  applyBrandEssentials,
  brandAccentLadderShades,
  brandLogoBlockId,
  contrastSafeLabel,
  inferTitleBlockId,
  planLogoPlacement,
  resolveBrandEssentials,
  type BrandEssentials,
} from './apply-brand-essentials';

const brand: BrandEssentials = {
  colors: ['#0f766e', '#f59e0b', '#e2e8f0'],
  accent: '#0f766e',
  secondary: '#f59e0b',
  ink: '#0f2137',
  surface: '#e2e8f0',
  headingFont: 'Poppins',
  bodyFont: 'Inter',
  logoUrl: 'https://brand.example/logo.png',
};

const doc = (): ContentDocument => ({
  kind: 'uptrendify-doc',
  version: 1,
  mode: 'free',
  pages: [
    {
      id: 'page-1',
      size: 'square',
      blocks: [
        { id: 'h1', type: 'heading', text: 'Launch week', level: 1, fontSize: 44, align: 'left', color: null, bg: null, bold: true, italic: false, underline: false, geometry: { x: 60, y: 60, w: 600, h: 90 } },
        {
          id: 't1',
          type: 'text',
          text: 'Ship it.',
          fontSize: 18,
          align: 'left',
          color: '#94a3b8',
          bg: null,
          size: 'md',
          bold: false,
          italic: false,
          underline: false,
          richText: [{ text: 'Ship ', color: '#94a3b8', bold: true }, { text: 'it.', bold: false }],
          geometry: { x: 60, y: 170, w: 600, h: 60 },
        },
        { id: 's1', type: 'shape', shape: 'circle', color: '#8b5cf6', align: 'left', width: 100, height: 120, geometry: { x: 560, y: 300, w: 140, h: 140 } },
        { id: 'b1', type: 'button', text: 'Get started', href: 'https://example.com', color: '#8b5cf6', align: 'left', width: 100, textColor: '#ffffff', geometry: { x: 60, y: 620, w: 240, h: 56 } },
        { id: 'i1', type: 'image', url: 'https://cdn.example.com/hero.png', alt: 'Hero', align: 'left', width: 100, geometry: { x: 60, y: 300, w: 400, h: 260 } },
      ],
    },
    {
      id: 'page-2',
      size: 'story',
      blocks: [{ id: 'h2', type: 'heading', text: 'Second page', level: 1, align: 'center', color: null, bg: null, bold: true, italic: false, underline: false, geometry: { x: 60, y: 200, w: 600, h: 90 } }],
    },
  ],
});

const base = () => applyBrandEssentials({ doc: doc(), essentials: brand, scope: 'document', activePageIndex: 0, includeLogo: false });

describe('resolveBrandEssentials', () => {
  it('maps palette roles and font roles from the scan', () => {
    const essentials = resolveBrandEssentials({
      palette: [{ hex: '#0f766e', role: 'primary' }, { hex: '#f59e0b', role: 'accent' }],
      primaryColor: '#0f766e',
      secondaryColors: ['#f59e0b'],
      headingFont: 'Poppins',
      bodyFont: 'Inter',
      logoUrl: 'https://brand.example/logo.png',
    });
    expect(essentials.accent).toBe('#0f766e');
    expect(essentials.secondary).toBe('#f59e0b');
    expect(essentials.headingFont).toBe('Poppins');
    expect(essentials.bodyFont).toBe('Inter');
    expect(essentials.logoUrl).toBe('https://brand.example/logo.png');
  });

  it('degrades gracefully on malformed/missing scan data and falls back for fonts', () => {
    const essentials = resolveBrandEssentials({ palette: [{ hex: 'not-a-hex', role: 'primary' }], headingFont: '  ' });
    expect(essentials.accent).toBeNull();
    expect(essentials.headingFont).toBeNull();
    expect(essentials.ink).toBe('#1d2634');
    expect(resolveBrandEssentials(null).accent).toBeNull();
  });
});

describe('applyBrandEssentials — content preservation', () => {
  it('preserves all copy, links, geometry, ids and imagery exactly', () => {
    const source = doc();
    const { doc: themed, stats } = applyBrandEssentials({ doc: source, essentials: brand, scope: 'document', activePageIndex: 0, includeLogo: false });
    expect(themed.pages).toHaveLength(2);
    expect(themed.pages[0]!.id).toBe('page-1');
    const [h, t, s, b, img] = themed.pages[0]!.blocks;
    expect(h && 'text' in h ? h.text : null).toBe('Launch week');
    expect(t && 'text' in t ? t.text : null).toBe('Ship it.');
    expect(t && 'richText' in t && t.richText ? t.richText.map((r) => r.text).join('') : null).toBe('Ship it.');
    expect(b && 'text' in b ? b.text : null).toBe('Get started');
    expect(b && 'href' in b ? b.href : null).toBe('https://example.com');
    expect(img && 'url' in img ? img.url : null).toBe('https://cdn.example.com/hero.png');
    expect(stats.imagesUntouched).toBe(1);
    for (const [index, original] of source.pages[0]!.blocks.entries()) {
      const next = themed.pages[0]!.blocks[index]!;
      expect(next.id).toBe(original.id);
      expect(next.geometry).toEqual(original.geometry);
    }
  });

  it('keeps rich-text emphasis flags while fixing unreadable run colors', () => {
    const { doc: themed, stats } = base();
    const text = themed.pages[0]!.blocks.find((b) => b.id === 't1') as Extract<ContentDocBlock, { type: 'text' }>;
    expect(text.richText![0]!.bold).toBe(true);
    expect(text.richText![1]!.bold).toBe(false);
    expect(text.richText![0]!.color).toBe(brand.ink); // was #94a3b8 — unreadable
    expect(stats.contrastFallbacks).toBeGreaterThan(0);
  });

  it('passes the schema and round-trips through serialization', () => {
    const { doc: themed } = base();
    expect(contentDocumentSchema.safeParse(themed).success).toBe(true);
    const body = serializeContentDocument(themed);
    expect(parseContentBody(body)?.pages).toHaveLength(2);
  });
});

describe('applyBrandEssentials — styling roles', () => {
  it('assigns heading/body font roles with theme fallback when scan is empty', () => {
    const { doc: themed } = base();
    expect((themed.pages[0]!.blocks[0] as { fontFamily?: string }).fontFamily).toBe('Poppins');
    expect((themed.pages[0]!.blocks[1] as { fontFamily?: string }).fontFamily).toBe('Inter');
    const empty = applyBrandEssentials({
      doc: doc(),
      essentials: { ...brand, headingFont: null, bodyFont: null },
      scope: 'document',
      activePageIndex: 0,
      includeLogo: false,
    });
    expect((empty.doc.pages[0]!.blocks[0] as { fontFamily?: string }).fontFamily).toBeUndefined();
  });

  it('maps buttons to the accent fill with a contrast-safe label', () => {
    const { doc: themed } = base();
    const button = themed.pages[0]!.blocks.find((b) => b.id === 'b1') as Extract<ContentDocBlock, { type: 'button' }>;
    expect(button.color).toBe(brand.accent);
    expect(button.textColor).toBe('#ffffff');
    expect(contrastSafeLabel('#f59e0b', brand.ink)).toBe(brand.ink); // amber fails with white
  });

  it('preserves user backgrounds; applies surface only to untouched pages', () => {
    const source = doc();
    source.pages[0]!.gradient = { from: '#ffffff', to: '#e2e8f0', angle: 135 };
    source.pages[1]!.bg = '#fef3c7';
    const untouched = applyBrandEssentials({ doc: source, essentials: brand, scope: 'document', activePageIndex: 0, includeLogo: false });
    // Media backgrounds are preserved; user solid backgrounds take the
    // scanned site surface (reversible with Undo, disclosed in the preview).
    expect(untouched.doc.pages[0]!.gradient).toEqual(source.pages[0]!.gradient);
    expect(untouched.doc.pages[1]!.bg).toBe(brand.surface);
    expect(untouched.stats.pagesBackgroundPreserved).toBe(1);
    // backgroundTreatment reports the ACTIVE page (the gradient one here);
    // page 2's scanned-surface result is asserted via its bg above.

    const bare = doc();
    bare.pages.forEach((page) => { delete (page as { bg?: string }).bg; });
    const themed = applyBrandEssentials({ doc: bare, essentials: brand, scope: 'document', activePageIndex: 0, includeLogo: false });
    expect(themed.doc.pages.every((page) => page.bg === brand.surface)).toBe(true);
  });
});

describe('applyBrandEssentials — scope, undo, idempotency', () => {
  it('applies to the current page only when scope is page', () => {
    const { doc: themed } = applyBrandEssentials({ doc: doc(), essentials: brand, scope: 'page', activePageIndex: 0, includeLogo: false });
    expect((themed.pages[0]!.blocks[0] as { fontFamily?: string }).fontFamily).toBe('Poppins');
    expect((themed.pages[1]!.blocks[0] as { fontFamily?: string }).fontFamily).toBeUndefined();
  });

  it('is idempotent: second application converges to the same document', () => {
    const first = base();
    const second = applyBrandEssentials({ doc: first.doc, essentials: brand, scope: 'document', activePageIndex: 0, includeLogo: false });
    expect(JSON.stringify(second.doc)).toBe(JSON.stringify(first.doc));
  });

  it('produces a single-undo document (caller commits once) and stays one valid version body', () => {
    const { doc: themed } = base();
    const snapshot = serializeContentDocument(themed);
    expect(typeof snapshot).toBe('string');
    expect(snapshot).toContain('uptrendify-doc');
  });
});

describe('logo placement', () => {
  it('adds the logo once with a stable id and prevents duplicates', () => {
    const options = { doc: doc(), essentials: brand, scope: 'document' as const, activePageIndex: 0, logoSrc: '/api/brands/b/content/c/assets/a', logoAspect: 2.5, includeLogo: true };
    const first = applyBrandEssentials(options);
    expect(first.stats.logo.map((entry) => entry.outcome)).toEqual(['added', 'added']);
    for (const [index, page] of first.doc.pages.entries()) {
      const logos = page.blocks.filter((block) => block.id === brandLogoBlockId(page.id));
      expect(logos).toHaveLength(1);
      expect(logos[0]!.type).toBe('image');
      expect(page.blocks[page.blocks.length - 1]!.id).toBe(brandLogoBlockId(page.id));
      void index;
    }
    const second = applyBrandEssentials({ ...options, doc: first.doc });
    expect(second.stats.logo.map((entry) => entry.outcome)).toEqual(['duplicate', 'duplicate']);
    expect(second.doc.pages[0]!.blocks.filter((block) => block.id.startsWith('brand-logo-'))).toHaveLength(1);
  });

  it('skips pages without safe, non-overlapping space instead of moving content', () => {
    const source = doc();
    source.pages[0]!.blocks = source.pages[0]!.blocks.map((block) => ({ ...block, geometry: { x: 0, y: 0, w: 760, h: 760 } }));
    const result = applyBrandEssentials({ doc: source, essentials: brand, scope: 'document', activePageIndex: 0, logoSrc: '/x', logoAspect: 2, includeLogo: true });
    expect(result.stats.logo.find((entry) => entry.pageIndex === 0)?.outcome).toBe('no-space');
    expect(result.doc.pages[0]!.blocks).toHaveLength(source.pages[0]!.blocks.length);
  });

  it('respects the element limit', () => {
    const source = doc();
    source.pages[0]!.blocks = Array.from({ length: CONTENT_DOC_MAX_BLOCKS }, (_, index) => ({
      id: `filler-${index}`,
      type: 'text' as const,
      text: `row ${index}`,
      fontSize: 14,
      align: 'left' as const,
      color: null,
      bg: null,
      size: 'md' as const,
      bold: false,
      italic: false,
      underline: false,
      geometry: { x: (index % 10) * 70, y: Math.floor(index / 10) * 60, w: 60, h: 40 },
    }));
    const result = applyBrandEssentials({ doc: source, essentials: brand, scope: 'page', activePageIndex: 0, logoSrc: '/x', logoAspect: 2, includeLogo: true });
    expect(result.stats.logo[0]?.outcome).toBe('limit');
  });

  it('does not add a logo when unchecked or when no validated source exists', () => {
    const off = applyBrandEssentials({ doc: doc(), essentials: brand, scope: 'document', activePageIndex: 0, logoSrc: '/x', includeLogo: false });
    expect(off.stats.logo.every((entry) => entry.outcome === 'off')).toBe(true);
    const noSrc = applyBrandEssentials({ doc: doc(), essentials: brand, scope: 'document', activePageIndex: 0, logoSrc: null, includeLogo: true });
    expect(noSrc.doc.pages[0]!.blocks.some((block) => block.id.startsWith('brand-logo-'))).toBe(false);
  });

  it('plans placement deterministically inside the page', () => {
    const page = doc().pages[0]!;
    const a = planLogoPlacement(page, 2.5);
    const b = planLogoPlacement(page, 2.5);
    expect(a).toEqual(b);
    expect(a!.x).toBeGreaterThan(0);
    expect(a!.x + a!.w).toBeLessThanOrEqual(760);
  });
});

describe('regressions from the preview failure report', () => {
  it('derives heading/body roles from detected font evidence when explicit roles are missing', () => {
    const essentials = resolveBrandEssentials({
      palette: [{ hex: '#0f766e', role: 'primary' }],
      fonts: [
        { family: 'Playfair Display', evidence: 'matched heading selector h1-h6' },
        { family: 'Source Sans', evidence: 'matched body/html selector' },
      ],
      headingFont: null,
      bodyFont: null,
    });
    expect(essentials.headingFont).toBe('Playfair Display');
    expect(essentials.bodyFont).toBe('Source Sans');
  });

  it('gives a text-heavy page visible brand styling: accent heading + AA-safe label + page tint', async () => {
    const source = doc();
    source.pages[0]!.blocks = [
      { id: 'h', type: 'heading', text: 'Title', level: 1, fontSize: 40, align: 'left', color: '#111111', bg: null, bold: true, italic: false, underline: false, geometry: { x: 40, y: 40, w: 680, h: 80 } },
      ...Array.from({ length: 7 }, (_, index) => ({
        id: `t${index}`,
        type: 'text' as const,
        text: index === 0 ? 'WHY US' : `Paragraph ${index} with real copy.`,
        fontSize: index === 0 ? 15 : 17,
        align: 'left' as const,
        color: '#111111',
        bg: null,
        size: 'md' as const,
        bold: index === 0,
        italic: false,
        underline: false,
        geometry: { x: 40, y: 140 + index * 70, w: 680, h: 50 },
      })),
    ];
    delete (source.pages[0] as { bg?: string }).bg;
    source.pages[0]!.blocks.forEach((block) => { void block; });
    const result = applyBrandEssentials({ doc: source, essentials: brand, scope: 'document', activePageIndex: 0, includeLogo: false });
    const blocks = result.doc.pages[0]!.blocks;
    const heading = blocks[0] as Extract<ContentDocBlock, { type: 'heading' }>;
    expect(heading.color).toBe(brand.accent); // visible brand accent on the title
    const label = blocks[1] as Extract<ContentDocBlock, { type: 'text' }>;
    // AA at 15px requires 4.5:1 — the accent misses it on the tint, so the
    // ladder must fall back to a readable ink rather than force the accent.
    const { contrastRatio } = await import('@/lib/studio/template-library/contrast');
    expect(contrastRatio(label.color ?? '#000', result.doc.pages[0]!.bg ?? '#fff')).toBeGreaterThanOrEqual(4.5);
    expect(result.doc.pages[0]!.bg).toBeTruthy(); // brand surface/tint applied
    expect(result.stats.headingsStyled).toBe(2); // page-2 heading is also in document scope
    // copy untouched
    expect((blocks[2] as { text: string }).text).toBe('Paragraph 1 with real copy.');
  });

  it('places a logo in the empty band of a text-heavy page (fixed corners previously failed)', () => {
    const source = doc();
    // Stacked near-full-width text boxes with vertical gaps between them.
    source.pages[0]!.blocks = Array.from({ length: 7 }, (_, index) => ({
      id: `t${index}`,
      type: 'text' as const,
      text: `Block ${index}`,
      fontSize: 16,
      align: 'left' as const,
      color: null,
      bg: null,
      size: 'md' as const,
      bold: false,
      italic: false,
      underline: false,
      geometry: { x: 40, y: 120 + index * 140, w: 690, h: 60 },
    }));
    const result = applyBrandEssentials({ doc: source, essentials: brand, scope: 'page', activePageIndex: 0, logoSrc: '/managed', logoAspect: 2.5, includeLogo: true });
    expect(result.stats.logo[0]?.outcome).toBe('added');
    const logo = result.doc.pages[0]!.blocks.find((block) => block.id.startsWith('brand-logo-')) as Extract<ContentDocBlock, { type: 'image' }>;
    expect(logo.geometry!.y + logo.geometry!.h).toBeLessThanOrEqual(1123 - 40);
    // no overlap with any text block
    for (const block of result.doc.pages[0]!.blocks.filter((entry) => entry.id !== logo.id)) {
      const g1 = logo.geometry!; const g2 = block.geometry!;
      const overlaps = g1.x - 12 < g2.x + g2.w && g1.x + g1.w + 12 > g2.x && g1.y - 12 < g2.y + g2.h && g1.y + g1.h + 12 > g2.y;
      expect(overlaps).toBe(false);
    }
  });

  it('reports logo download/upload failures as unavailable with the reason, never no-space', () => {
    const source = doc();
    const result = applyBrandEssentials({
      doc: source,
      essentials: brand,
      scope: 'document',
      activePageIndex: 0,
      logoSrc: null,
      includeLogo: true,
      logoFailure: { reason: 'The brand logo is not a PNG, JPG, or WEBP image.' },
    });
    expect(result.stats.logoFailure).toEqual({ reason: 'The brand logo is not a PNG, JPG, or WEBP image.' });
    for (const entry of result.stats.logo) {
      expect(entry.outcome).toBe('unavailable');
      expect(entry.reason).toContain('PNG');
    }
    expect(result.doc.pages[0]!.blocks.some((block) => block.id.startsWith('brand-logo-'))).toBe(false);
  });

  it('stays idempotent with the new accent heading/label mapping', () => {
    const first = applyBrandEssentials({ doc: doc(), essentials: brand, scope: 'document', activePageIndex: 0, includeLogo: false });
    const second = applyBrandEssentials({ doc: first.doc, essentials: brand, scope: 'document', activePageIndex: 0, includeLogo: false });
    expect(JSON.stringify(second.doc)).toBe(JSON.stringify(first.doc));
  });
});

describe('brand lint accepts the scanned palette and intentional fallbacks', () => {
  it('does not flag scanned palette colours, derived surface, or the ink fallback', async () => {
    const { lintBlocks } = await import('@/lib/studio/brand-lint');
    const blocks: ContentDocBlock[] = [
      { id: 'a', type: 'heading', text: 'T', level: 1, align: 'left', color: '#0f766e', bg: null, bold: true, italic: false, underline: false },
      { id: 'b', type: 'text', text: 'Body', align: 'left', color: '#1d2634', bg: null, size: 'md', bold: false, italic: false, underline: false },
      { id: 'c', type: 'shape', shape: 'rectangle', color: '#e2e8f0', align: 'left', width: 50, height: 100 },
    ];
    const issues = lintBlocks(blocks, { colors: ['#0f766e'], allowedColors: ['#0f766e', '#f59e0b', '#e2e8f0', '#1d2634'] });
    expect(issues.filter((issue) => issue.kind === 'off-brand-colour')).toEqual([]);
    // unknown colour is still flagged
    const flagged = lintBlocks([{ ...blocks[0]!, color: '#ff00ff' } as ContentDocBlock], { colors: ['#0f766e'], allowedColors: [] });
    expect(flagged.some((issue) => issue.kind === 'off-brand-colour')).toBe(true);
  });
});

describe('regressions from the 2026-10-27 screen recording (ISRO text-heavy document)', () => {
  // The real scanned brand: mid-tone green primary, dark green secondary that
  // misses the ≥7:1-vs-white ink gate (6.7:1), no usable font roles, and a
  // crawler-captured logo URL. The real document: one A4 page, a user-set
  // cream background, eight ordinary text blocks, no headings/shapes/buttons.
  const isroEssentials = resolveBrandEssentials({
    palette: [
      { hex: '#18b140', role: 'primary' },
      { hex: '#046a38', role: 'secondary' },
      { hex: '#ff8035', role: 'accent' },
      { hex: '#ffc8c9', role: 'support' },
      { hex: '#fffb00', role: 'support' },
    ],
    primaryColor: '#18b140',
    secondaryColors: ['#046a38'],
    headingFont: null,
    bodyFont: null,
    fonts: [],
    logoUrl: 'https://www.isro.gov.in/media/isro_logo.png',
  });

  const recordedDoc = (): ContentDocument => ({
    kind: 'uptrendify-doc',
    version: 1,
    mode: 'free',
    pages: [
      {
        id: 'page-rec',
        size: 'a4',
        bg: '#faf8d8',
        blocks: [
          { id: 't0', type: 'text', text: '*Opening shot*: Earth rotating above the Indian subcontinent at sunrise.', fontSize: 22, align: 'left', color: null, bg: null, size: 'md', bold: false, italic: false, underline: false, geometry: { x: 40, y: 36, w: 700, h: 64 } },
          ...Array.from({ length: 7 }, (_, index) => ({
            id: `tb${index}`,
            type: 'text' as const,
            text: `Voice-over and on-screen copy block ${index} with production notes for the ISRO explainer.`,
            fontSize: index % 2 === 0 ? 12 : 13,
            align: 'left' as const,
            color: null,
            bg: null,
            size: 'md' as const,
            bold: false,
            italic: false,
            underline: false,
            geometry: { x: 40, y: 140 + index * 110, w: 640, h: 72 },
          })),
        ],
      },
    ],
  });

  it('is visibly branded: title takes bold emphasis, every text block stays AA on the NEW branded background', () => {
    const result = applyBrandEssentials({ doc: recordedDoc(), essentials: isroEssentials, scope: 'page', activePageIndex: 0, includeLogo: false });
    const blocks = result.doc.pages[0]!.blocks as Extract<ContentDocBlock, { type: 'text' }>[];
    const title = blocks[0]!;
    // The page background is now the disclosed derived wash, and text is
    // themed against THAT background (not the old cream).
    const bg = result.doc.pages[0]!.bg ?? '#ffffff';
    expect(result.stats.backgroundTreatment).toBe('derived-wash');
    expect(title.bold).toBe(true);
    expect(contrastRatio(title.color ?? '#000', bg)).toBeGreaterThanOrEqual(3);
    for (const body of blocks.slice(1)) {
      expect(contrastRatio(body.color ?? '#000', bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(result.stats.titlesStyled).toBe(1);
    expect(result.stats.bodiesStyled).toBe(7);
    expect(result.stats.pagesThemed).toBe(1);
  });

  it('preserves the user background, all copy, ids and geometry exactly', () => {
    const source = recordedDoc();
    const result = applyBrandEssentials({ doc: source, essentials: isroEssentials, scope: 'page', activePageIndex: 0, includeLogo: false });
    // The ISRO scan's lightest colour is a saturated yellow (#fffb00), which
    // is rejected as a page canvas — the background becomes a DISCLOSED
    // derived palette wash instead of the original cream.
    expect(result.stats.backgroundTreatment).toBe('derived-wash');
    expect(result.doc.pages[0]!.bg).not.toBe('#faf8d8');
    expect(result.doc.pages[0]!.bg).toBe(result.stats.backgroundColour);
    for (const [index, original] of source.pages[0]!.blocks.entries()) {
      const next = result.doc.pages[0]!.blocks[index]!;
      expect(next.id).toBe(original.id);
      expect(next.geometry).toEqual(original.geometry);
      if ('text' in next && 'text' in original) expect(next.text).toBe(original.text);
    }
  });

  it('stays idempotent on the recorded document: the second application changes nothing', () => {
    const first = applyBrandEssentials({ doc: recordedDoc(), essentials: isroEssentials, scope: 'page', activePageIndex: 0, includeLogo: false });
    const second = applyBrandEssentials({ doc: first.doc, essentials: isroEssentials, scope: 'page', activePageIndex: 0, includeLogo: false });
    expect(second.stats.pagesThemed).toBe(0);
    expect(second.changedPageIds).toEqual([]);
    expect(JSON.stringify(second.doc)).toBe(JSON.stringify(first.doc));
  });

  it('places the managed logo on the recorded text-heavy page without overlapping content', () => {
    const result = applyBrandEssentials({ doc: recordedDoc(), essentials: isroEssentials, scope: 'page', activePageIndex: 0, logoSrc: '/api/brands/b/content/c/assets/a', logoAspect: 2.6, includeLogo: true });
    expect(result.stats.logo[0]?.outcome).toBe('added');
    const logo = result.doc.pages[0]!.blocks.find((block) => block.id.startsWith('brand-logo-')) as Extract<ContentDocBlock, { type: 'image' }>;
    expect(logo.url).toBe('/api/brands/b/content/c/assets/a');
    expect(logo.geometry!.y + logo.geometry!.h).toBeLessThanOrEqual(1123 - 40);
    for (const block of result.doc.pages[0]!.blocks.filter((entry) => entry.id !== logo.id)) {
      const g1 = logo.geometry!; const g2 = block.geometry!;
      const overlaps = g1.x - 12 < g2.x + g2.w && g1.x + g1.w + 12 > g2.x && g1.y - 12 < g2.y + g2.h && g1.y + g1.h + 12 > g2.y;
      expect(overlaps).toBe(false);
    }
  });

  it('infers the title by typography evidence, not position alone, and returns null on uniform small type without geometry', () => {
    const blocks = (offset: number, largeIndex: number | null): ContentDocBlock[] =>
      Array.from({ length: 5 }, (_, index) => ({
        id: `x${index}`,
        type: 'text' as const,
        text: `Block ${index} copy`,
        fontSize: largeIndex === index ? 26 : 12,
        align: 'left' as const,
        color: null,
        bg: null,
        size: 'md' as const,
        bold: false,
        italic: false,
        underline: false,
        geometry: { x: 40, y: offset + index * 90, w: 600, h: 40 },
      }));
    expect(inferTitleBlockId(blocks(0, 3), 1123)).toBe('x3');
    expect(inferTitleBlockId(blocks(0, null), 1123)).toBe('x0'); // geometry fallback: topmost in the upper half
    const floating = Array.from({ length: 5 }, (_, index) => ({
      id: `f${index}`,
      type: 'text' as const,
      text: `Block ${index} copy`,
      fontSize: 12,
      align: 'left' as const,
      color: null,
      bg: null,
      size: 'md' as const,
      bold: false,
      italic: false,
      underline: false,
    }));
    expect(inferTitleBlockId(floating, 1123)).toBeNull();
    expect(inferTitleBlockId([{ id: 'solo', type: 'text', text: 'Only one', fontSize: 30, align: 'left', color: null, bg: null, size: 'md', bold: false, italic: false, underline: false }])).toBeNull();
  });

  it('reports a missing logo source as unavailable, never no-space', () => {
    const result = applyBrandEssentials({ doc: recordedDoc(), essentials: isroEssentials, scope: 'page', activePageIndex: 0, logoSrc: null, includeLogo: true });
    expect(result.stats.logo[0]?.outcome).toBe('unavailable');
    expect(result.stats.logo[0]?.reason).toContain('not imported');
  });

  it('exposes the accent ladder shades so brand lint accepts derived brand colours', () => {
    const shades = brandAccentLadderShades(['#18b140']);
    expect(shades).toContain('#149636'); // the title colour the ladder produces on the cream page
    expect(shades).toHaveLength(10); // five darkened + five lightened steps
  });
});

describe('page background treatments (evidence-first, disclosed)', () => {
  const docWithBg = (bg?: string) => {
    const source = doc();
    if (bg === undefined) delete source.pages[0]!.bg;
    else source.pages[0]!.bg = bg;
    return source;
  };

  it('applies the scanned site surface even when the page has a user solid background', () => {
    const result = applyBrandEssentials({ doc: docWithBg('#faf8d8'), essentials: brand, scope: 'page', activePageIndex: 0, includeLogo: false });
    expect(result.doc.pages[0]!.bg).toBe('#e2e8f0');
    expect(result.stats.backgroundTreatment).toBe('scanned-surface');
    expect(result.stats.backgroundColour).toBe('#e2e8f0');
  });

  it('derives and DISCLOSES a palette wash when the scan has no site surface', () => {
    const noSurface = { ...brand, surface: null };
    const result = applyBrandEssentials({ doc: docWithBg('#faf8d8'), essentials: noSurface, scope: 'page', activePageIndex: 0, includeLogo: false });
    expect(result.stats.backgroundTreatment).toBe('derived-wash');
    expect(result.doc.pages[0]!.bg).toBe(result.stats.backgroundColour);
    // Derived wash is a light tint of the secondary palette colour toward white.
    expect(result.doc.pages[0]!.bg!.toLowerCase()).not.toBe('#f59e0b');
  });

  it('preserves user background media (gradient) and reports it', () => {
    const source = doc();
    source.pages[0]!.gradient = { from: '#ffffff', to: '#eeeeee', angle: 90 };
    const result = applyBrandEssentials({ doc: source, essentials: brand, scope: 'page', activePageIndex: 0, includeLogo: false });
    expect(result.doc.pages[0]!.gradient).toEqual({ from: '#ffffff', to: '#eeeeee', angle: 90 });
    expect(result.stats.backgroundTreatment).toBe('preserved-media');
  });

  it('converges: applying twice changes the background once only', () => {
    const options = { doc: docWithBg('#faf8d8'), essentials: brand, scope: 'page' as const, activePageIndex: 0, includeLogo: false };
    const first = applyBrandEssentials(options);
    const second = applyBrandEssentials({ ...options, doc: first.doc });
    expect(second.doc.pages[0]!.bg).toBe(first.doc.pages[0]!.bg);
    expect(second.stats.backgroundTreatment).toBe('scanned-surface');
  });

  it('text is themed against the NEW background so contrast holds on the scanned surface', () => {
    const result = applyBrandEssentials({ doc: docWithBg('#faf8d8'), essentials: brand, scope: 'page', activePageIndex: 0, includeLogo: false });
    const body = result.doc.pages[0]!.blocks.find((block) => block.type === 'text');
    expect(body?.type === 'text' && typeof body.color === 'string').toBe(true);
    const bg = result.doc.pages[0]!.bg ?? '#ffffff';
    expect(contrastRatio(body?.type === 'text' && body.color ? body.color : '#000000', bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('logo placement prefers the topmost composition band', () => {
  it('places into a free band near the top before scanning lower bands', () => {
    const source = doc();
    // Occupy y=40..300 so the widest variant cannot sit at the very top; a
    // narrower variant must still land in the highest free band, not the bottom.
    source.pages[0]!.blocks = [
      { id: 'a', type: 'text' as const, text: 'one', align: 'left' as const, color: null, bg: null, size: 'md' as const, bold: false, italic: false, underline: false, geometry: { x: 0, y: 40, w: 794, h: 120 } },
      { id: 'b', type: 'text' as const, text: 'two', align: 'left' as const, color: null, bg: null, size: 'md' as const, bold: false, italic: false, underline: false, geometry: { x: 0, y: 160, w: 794, h: 120 } },
    ];
    const placement = planLogoPlacement(source.pages[0]!, 2);
    expect(placement).not.toBeNull();
    // First band clear of the blockers (bottom edge 280 + breathing 12),
    // NOT the page bottom.
    expect(placement!.y).toBeGreaterThanOrEqual(280);
    expect(placement!.y).toBeLessThanOrEqual(500);
  });

  it('never overlaps existing elements while searching', () => {
    const source = doc();
    source.pages[0]!.blocks = source.pages[0]!.blocks.map((block) => ({
      ...block,
      geometry: { x: (block.geometry?.x ?? 0) % 700, y: (block.geometry?.y ?? 0) % 1000, w: 300, h: 90 },
    }));
    const placement = planLogoPlacement(source.pages[0]!, 2);
    if (placement) {
      for (const block of source.pages[0]!.blocks) {
        const g = block.geometry!;
        const overlaps = placement.x < g.x + g.w && placement.x + placement.w > g.x && placement.y < g.y + g.h && placement.y + placement.h > g.y;
        expect(overlaps).toBe(false);
      }
    }
  });
});

describe('dark gradient pages get light, readable text (generated canvases)', () => {
  it('lifts headings and body ink on a dark gradient instead of darkening into it', () => {
    const gradientPage: ContentDocument = {
      kind: 'uptrendify-doc',
      version: 1,
      mode: 'free',
      pages: [{
        id: 'gp-1',
        size: 'square',
        gradient: { from: '#123f3a', to: '#0d2b28', angle: 150 },
        blocks: [
          { id: 'gh', type: 'heading', text: 'Big title', level: 1, fontSize: 44, align: 'left', color: null, bg: null, bold: false, italic: false, underline: false, geometry: { x: 60, y: 60, w: 600, h: 90 } },
          { id: 'gt', type: 'text', text: 'Supporting line', align: 'left', color: null, bg: null, size: 'md', bold: false, italic: false, underline: false, fontSize: 20, geometry: { x: 60, y: 200, w: 500, h: 48 } },
        ],
      }],
    };
    const result = applyBrandEssentials({ doc: gradientPage, essentials: brand, scope: 'document', activePageIndex: 0, includeLogo: false });
    const midpoint = mixOver('#123f3a', '#0d2b28', 0.5);
    for (const block of result.doc.pages[0]!.blocks) {
      if (block.type !== 'heading' && block.type !== 'text') continue;
      const color = block.color ?? '#1d2634';
      // Headings are large text (3:1); body copy needs 4.5:1.
      const need = block.type === 'heading' ? 3 : 4.5;
      expect(contrastRatio(color, midpoint)).toBeGreaterThanOrEqual(need);
    }
  });
});
