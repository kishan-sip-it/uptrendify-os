import { describe, expect, it } from 'vitest';
import { parseContentBody, serializeContentDocument } from '@/lib/content/document';
import { importSvgTemplate } from './import-template';

const SAMPLE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">',
  '<rect id="background-panel" x="20" y="20" width="240" height="140" fill="#e63b48" />',
  '<text x="50" y="90" font-family="Arial" font-size="24" font-weight="700" fill="#ffffff">Editable launch title</text>',
  '<g transform="translate(300 30)"><path d="M 0 0 L 100 50 L 0 100 Z" fill="#5533aa" /></g>',
  '</svg>',
].join('');

describe('Canva SVG template import', () => {
  it('detects separate text and vector objects and assigns editable canvas geometry', () => {
    const imported = importSvgTemplate(SAMPLE_SVG);
    expect(imported).not.toBeNull();
    expect(imported?.detectedElements).toBe(3);
    expect(imported?.page.size).toBe('wide');
    expect(imported?.page.blocks.map((block) => block.type)).toEqual(['shape', 'text', 'shape']);

    const headline = imported?.page.blocks[1];
    expect(headline?.type).toBe('text');
    if (headline?.type === 'text') {
      expect(headline.text).toBe('Editable launch title');
      expect(headline.bold).toBe(true);
      expect(headline.geometry?.w).toBeGreaterThan(100);
    }

    const vector = imported?.page.blocks[2];
    expect(vector?.type).toBe('shape');
    if (vector?.type === 'shape') {
      expect(vector.svgPath).toContain('L 100 50');
      expect(vector.svgBounds?.w).toBeGreaterThan(0);
      expect(vector.svgMatrix?.e).toBe(300);
    }
  });

  it('round-trips imported path geometry through the shared saved-document schema', () => {
    const imported = importSvgTemplate(SAMPLE_SVG);
    expect(imported).not.toBeNull();
    if (!imported) return;
    const body = serializeContentDocument({ kind: 'uptrendify-doc', version: 1, mode: 'free', pages: [imported.page] });
    const parsed = parseContentBody(body);
    expect(parsed).not.toBeNull();
    expect(parsed?.pages[0]?.blocks).toHaveLength(3);
    const vector = parsed?.pages[0]?.blocks[2];
    expect(vector?.type === 'shape' ? vector.svgPath : undefined).toContain('L 100 50');
  });

  it('rejects doctypes/external entities and files without an SVG root', () => {
    expect(importSvgTemplate('<!DOCTYPE svg [<!ENTITY x SYSTEM "https://example.com/x">]><svg viewBox="0 0 10 10"><text>&x;</text></svg>')).toBeNull();
    expect(importSvgTemplate('<html><body>not an SVG</body></html>')).toBeNull();
  });

  it('uploads embedded raster references separately instead of persisting data URLs', () => {
    const svg = '<svg width="200" height="100" viewBox="0 0 200 100"><image x="20" y="10" width="100" height="60" href="data:image/png;base64,aGVsbG8=" /></svg>';
    const imported = importSvgTemplate(svg);
    expect(imported?.embeddedImages).toHaveLength(1);
    expect(imported?.page.blocks[0]?.type).toBe('image');
    const image = imported?.page.blocks[0];
    expect(image?.type === 'image' ? image.url.startsWith('data:') : true).toBe(false);
  });
});
