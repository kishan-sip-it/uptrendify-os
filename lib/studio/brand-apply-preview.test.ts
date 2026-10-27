import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseContentBody, type ContentDocument } from '@/lib/content/document';
import { ContentDocumentView } from '@/components/content/content-document-view';
import { resolveBrandEssentials } from './apply-brand-essentials';
import { buildBrandApplyPreview } from './brand-apply-preview';

/**
 * Regression for the 2026-10-27 recording: both Apply previews rendered the
 * stale raster snapshot (or identical live blocks), so Before and After were
 * pixel-identical and judged useless. These tests assert the RENDERED markup:
 * the After side must render the transformed structured blocks while the
 * Before side stays exactly the live document (snapshot included).
 */

const essentials = resolveBrandEssentials({
  palette: [
    { hex: '#18b140', role: 'primary' },
    { hex: '#046a38', role: 'secondary' },
    { hex: '#ff8035', role: 'accent' },
  ],
  primaryColor: '#18b140',
  secondaryColors: ['#046a38'],
  logoUrl: 'https://www.isro.gov.in/media/isro_logo.png',
});

const recordedDoc = (withSnapshot: boolean): ContentDocument => ({
  kind: 'uptrendify-doc',
  version: 1,
  mode: 'free',
  pages: [
    {
      id: 'page-rec',
      size: 'a4',
      bg: '#faf8d8',
      ...(withSnapshot ? {
        snapshot: {
          path: 'org/content-artworks/brand/content/crypto-uuid/page-1.png',
          width: 794,
          height: 1123,
          pixelRatio: 2,
          mimeType: 'image/png' as const,
          sha256: 'a'.repeat(64),
        },
      } : {}),
      blocks: [
        { id: 't0', type: 'text', text: '*Opening shot*: Earth rotating above the Indian subcontinent at sunrise.', fontSize: 22, align: 'left', color: null, bg: null, size: 'md', bold: false, italic: false, underline: false, geometry: { x: 40, y: 36, w: 700, h: 64 } },
        ...Array.from({ length: 7 }, (_, index) => ({
          id: `tb${index}`,
          type: 'text' as const,
          text: `Voice-over and on-screen copy block ${index} with production notes.`,
          fontSize: 12,
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

describe('buildBrandApplyPreview', () => {
  it('keeps Before byte-identical to the live document (snapshot untouched) and renders After from blocks', () => {
    const source = recordedDoc(true);
    const preview = buildBrandApplyPreview({ pages: source.pages, essentials, scope: 'page', activePageIndex: 0, includeLogo: false });

    const beforeDoc = parseContentBody(preview.before);
    expect(beforeDoc?.pages[0]?.snapshot).toEqual(source.pages[0]!.snapshot);
    expect(beforeDoc?.pages).toEqual(source.pages);

    const afterDoc = parseContentBody(preview.after);
    expect(afterDoc?.pages[0]?.snapshot).toBeUndefined();
    // The changed page still carries the transformed design.
    const title = afterDoc?.pages[0]?.blocks[0] as { color?: string; bold?: boolean };
    expect(title.color).toBe('#149636');
    expect(title.bold).toBe(true);
  });

  it('RENDERED proof: Before renders the saved raster state, After renders the transformed blocks', () => {
    const source = recordedDoc(true);
    const preview = buildBrandApplyPreview({ pages: source.pages, essentials, scope: 'page', activePageIndex: 0, includeLogo: false });

    const beforeMarkup = renderToStaticMarkup(createElement(ContentDocumentView, { body: preview.before, fitToBounds: true, pageIndex: 0 }));
    const afterMarkup = renderToStaticMarkup(createElement(ContentDocumentView, { body: preview.after, fitToBounds: true, pageIndex: 0 }));

    // Before: the page still has a snapshot, so the renderer shows the saved
    // artwork slot (SSR renders its loading state) and NOT the styled blocks.
    expect(beforeMarkup).toContain('Loading saved artwork');
    expect(beforeMarkup).not.toContain('color:#149636');

    // After: the invalidated snapshot lets the transformed structured blocks
    // render — the inferred title shows the readable accent, visibly branded.
    expect(afterMarkup).toContain('Earth rotating above the Indian subcontinent');
    expect(afterMarkup).toContain('color:#149636');
    expect(afterMarkup).toContain('font-weight:700');
    // The two previews are no longer identical.
    expect(beforeMarkup).not.toBe(afterMarkup);
  });

  it('RENDERED proof without any snapshot: Before is untouched live styling, After is branded', () => {
    const source = recordedDoc(false);
    const preview = buildBrandApplyPreview({ pages: source.pages, essentials, scope: 'page', activePageIndex: 0, includeLogo: false });

    const beforeMarkup = renderToStaticMarkup(createElement(ContentDocumentView, { body: preview.before, fitToBounds: true, pageIndex: 0 }));
    const afterMarkup = renderToStaticMarkup(createElement(ContentDocumentView, { body: preview.after, fitToBounds: true, pageIndex: 0 }));

    expect(beforeMarkup).toContain('color:#1d2634'); // theme-default ink
    expect(beforeMarkup).not.toContain('color:#149636');
    expect(afterMarkup).toContain('color:#149636');
    expect(afterMarkup).toContain('color:#046a38'); // branded body ink
    expect(beforeMarkup).not.toBe(afterMarkup);
  });

  it('proposes the logo in After without mutating the live document or uploading anything', () => {
    const source = recordedDoc(false);
    const preview = buildBrandApplyPreview({
      pages: source.pages,
      essentials,
      scope: 'page',
      activePageIndex: 0,
      includeLogo: true,
      logoSrc: 'https://www.isro.gov.in/media/isro_logo.png',
      logoAspect: 2.6,
    });
    const afterDoc = parseContentBody(preview.after);
    const logo = afterDoc?.pages[0]?.blocks.find((block) => block.id.startsWith('brand-logo-')) as { url?: string } | undefined;
    expect(logo?.url).toBe('https://www.isro.gov.in/media/isro_logo.png');
    // Live pages passed in were never mutated.
    expect(source.pages[0]!.blocks.some((block) => block.id.startsWith('brand-logo-'))).toBe(false);
    expect(preview.note).toContain('managed copy');
    expect(preview.note).toContain('Apply imports');
  });

  it('states honestly when the logo cannot be placed or is unavailable', () => {
    const source = recordedDoc(true);
    const unavailable = buildBrandApplyPreview({
      pages: source.pages, essentials, scope: 'page', activePageIndex: 0, includeLogo: true, logoSrc: null,
      logoFailure: { reason: 'The brand logo is not a PNG, JPG, or WEBP image.' },
    });
    expect(unavailable.note).toBe('Logo will not be placed: The brand logo is not a PNG, JPG, or WEBP image.');
    const off = buildBrandApplyPreview({ pages: source.pages, essentials, scope: 'page', activePageIndex: 0, includeLogo: false });
    expect(off.note).toBeNull();
  });
});
