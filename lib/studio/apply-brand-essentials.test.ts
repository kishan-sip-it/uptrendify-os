import { describe, expect, it } from 'vitest';
import { CONTENT_DOC_MAX_BLOCKS, contentDocumentSchema, serializeContentDocument, parseContentBody, type ContentDocument } from '@/lib/content/document';
import type { ContentDocBlock } from '@/lib/content/document';
import {
  applyBrandEssentials,
  brandLogoBlockId,
  contrastSafeLabel,
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
    expect(untouched.doc.pages[0]!.gradient).toEqual(source.pages[0]!.gradient);
    expect(untouched.doc.pages[1]!.bg).toBe('#fef3c7');
    expect(untouched.stats.pagesBackgroundPreserved).toBe(2);

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
