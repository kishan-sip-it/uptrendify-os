import { describe, expect, it } from 'vitest';
import { contentDocumentSchema, CONTENT_PAGE_SIZES, parseContentBody, serializeContentDocument } from '@/lib/content/document';
import { buildTemplateDocument, buildTemplatePages, templateFingerprints } from './build';
import { templatePaletteByName } from './art';
import type { TemplateDefinition } from './types';

const definition: TemplateDefinition = {
  id: 't-test-001',
  name: 'Builder smoke template',
  category: 'social',
  subcategory: 'Quotes',
  format: 'square',
  style: 'bold',
  useCase: 'Verify the builder end to end.',
  audience: 'QA engineers',
  tags: ['test', 'smoke'],
  pages: [
    {
      size: 'square',
      bg: '#f6f8fc',
      gradient: { from: '#ffffff', to: '#2563eb', angle: 135 },
      blocks: [
        { kind: 'shape', art: 'blob', x: -40, y: 420, w: 400, h: 400, color: 'soft', opacity: 0.5 },
        { kind: 'shape', art: 'check', artStroke: true, x: 60, y: 60, w: 48, h: 48, color: 'accent' },
        { kind: 'heading', text: 'Structured beats plain', x: 60, y: 140, w: 600, h: 180, fontSize: 44, color: 'ink', font: 'display' },
        { kind: 'text', text: 'Every template becomes an editable document.', x: 60, y: 340, w: 600, h: 90, fontSize: 20, align: 'left', color: 'ink' },
        { kind: 'shape', shape: 'circle', x: 560, y: 60, w: 140, h: 140, color: 'accent' },
        { kind: 'button', text: 'Try the editor', x: 60, y: 620, w: 240, h: 56, color: 'accent' },
      ],
    },
    {
      size: 'story',
      blocks: [{ kind: 'text', text: 'Second page copy.', x: 60, y: 200, w: 620, h: 80, fontSize: 22, align: 'center' }],
    },
  ],
};

describe('template builder', () => {
  it('produces a schema-valid free-mode document with deterministic ids', () => {
    const palette = templatePaletteByName('paperblue');
    const doc = buildTemplateDocument(definition, palette);
    expect(doc.mode).toBe('free');
    expect(doc.pages).toHaveLength(2);
    const parsed = contentDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);

    const body = serializeContentDocument(doc);
    const reparsed = parseContentBody(body);
    expect(reparsed).not.toBeNull();
    expect(reparsed?.pages[0]?.gradient).toEqual({ from: '#ffffff', to: '#2563eb', angle: 135 });
    expect(reparsed?.pages[0]?.bg).toBe('#f6f8fc');

    // Deterministic ids across builds.
    const again = buildTemplateDocument(definition, palette);
    expect(again.pages.map((page) => page.id)).toEqual(doc.pages.map((page) => page.id));
    expect(again.pages[0]!.blocks.map((block) => block.id)).toEqual(doc.pages[0]!.blocks.map((block) => block.id));
  });

  it('serializes a single page in flat form without losing bg or gradient', () => {
    const palette = templatePaletteByName('paperblue');
    const [onlyPage] = buildTemplatePages({ ...definition, pages: definition.pages.slice(0, 1) }, palette);
    const doc = { kind: 'uptrendify-doc' as const, version: 1 as const, mode: 'free' as const, pages: [onlyPage!] };
    const body = serializeContentDocument(doc);
    expect(body).toContain('"gradient"');
    expect(body).toContain('"bg":"#f6f8fc"');
    const reparsed = parseContentBody(body);
    expect(reparsed?.pages[0]?.bg).toBe('#f6f8fc');
    expect(reparsed?.pages[0]?.gradient?.angle).toBe(135);
  });

  it('maps vector art to editable svgPath shapes and keeps geometry in bounds', () => {
    const palette = templatePaletteByName('paperblue');
    const [page] = buildTemplatePages(definition, palette);
    const dims = CONTENT_PAGE_SIZES[page!.size];
    const art = page!.blocks.find((block) => block.type === 'shape' && block.svgPath);
    expect(art).toBeTruthy();
    if (art?.type === 'shape') {
      expect(art.svgBounds).toEqual({ x: 0, y: 0, w: 310, h: 208 });
      expect(art.svgMatrix).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    }
    for (const block of page!.blocks) {
      expect(block.geometry!.w).toBeGreaterThanOrEqual(24);
      expect(block.geometry!.h).toBeGreaterThanOrEqual(24);
      expect(block.geometry!.x).toBeLessThanOrEqual(4000);
      expect(block.geometry!.y).toBeLessThanOrEqual(dims.height + 2000);
    }
  });

  it('substitutes the brand accent only into accent slots', () => {
    const palette = templatePaletteByName('paperblue');
    const [page] = buildTemplatePages(definition, palette, '#ff8800');
    const heading = page!.blocks.find((block) => block.type === 'heading');
    const circle = page!.blocks.find((block) => block.type === 'shape' && !block.svgPath);
    expect(heading?.color).toBe('#16243d'); // ink untouched
    expect(circle?.color).toBe('#ff8800'); // accent slot re-coloured
  });

  it('fingerprints differ when composition differs, match when identical', () => {
    const [a] = templateFingerprints(definition);
    const [b] = templateFingerprints({ ...definition, id: 't-test-002', pages: [definition.pages[0]!] });
    expect(a).toBe(b); // same composition, different id
    const moved = templateFingerprints({
      ...definition,
      pages: [{ ...definition.pages[0]!, blocks: definition.pages[0]!.blocks.map((block, index) => (index === 2 ? { ...block, y: block.y + 48, fontSize: 38 } : block)) }],
    });
    expect(moved[0]).not.toBe(a);
  });
});
