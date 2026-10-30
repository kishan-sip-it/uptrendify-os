import { describe, expect, it } from 'vitest';
import {
  MAGIC_LAYERS_MAX_ELEMENTS,
  buildMagicLayerPage,
  canvasFontSize,
  containFitMapping,
  honestShapeKind,
  mapBoxToCanvasGeometry,
  nearestPageSizeForRatio,
  validateMagicLayerPlan,
  verifySolidBackground,
  verifySolidShapeFill,
  type MagicLayerElement,
  type MagicLayerPlan,
} from './magic-layers';
import { eraseRasterRegionPixels } from './raster-layers';

function hex(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

describe('nearestPageSizeForRatio', () => {
  it('maps common design aspect ratios to their preset canvas', () => {
    expect(nearestPageSizeForRatio(1080, 1080)).toBe('square');
    expect(nearestPageSizeForRatio(1080, 1920)).toBe('story');
    expect(nearestPageSizeForRatio(1080, 1350)).toBe('portrait');
    expect(nearestPageSizeForRatio(1200, 628)).toBe('landscapeSocial');
    expect(nearestPageSizeForRatio(794, 1123)).toBe('a4');
    expect(nearestPageSizeForRatio(1280, 720)).toBe('wide');
  });
});

describe('containFitMapping', () => {
  it('fits a square source exactly into the square canvas', () => {
    const mapping = containFitMapping(1000, 1000);
    expect(mapping.size).toBe('square');
    expect(mapping.imageWidth).toBe(760);
    expect(mapping.imageHeight).toBe(760);
    expect(mapping.offsetX).toBe(0);
    expect(mapping.offsetY).toBe(0);
  });

  it('contains a 4:5 source inside the portrait canvas with centred offsets', () => {
    const mapping = containFitMapping(1000, 1250);
    expect(mapping.size).toBe('portrait');
    expect(mapping.imageHeight).toBeCloseTo(950, 5);
    expect(mapping.imageWidth).toBeCloseTo(760, 5);
    expect(mapping.offsetX).toBe(0);
    expect(mapping.offsetY).toBe(0);
  });
});

describe('mapBoxToCanvasGeometry', () => {
  it('round-trips a normalized box onto the canvas', () => {
    const mapping = containFitMapping(1000, 1000);
    const geometry = mapBoxToCanvasGeometry({ x: 100, y: 100, w: 300, h: 200 }, mapping);
    expect(geometry).toEqual({ x: 76, y: 76, w: 228, h: 152 });
  });

  it('clamps tiny boxes up to the 24px schema minimum instead of failing the save', () => {
    const mapping = containFitMapping(2000, 2000);
    const geometry = mapBoxToCanvasGeometry({ x: 10, y: 10, w: 3, h: 3 }, mapping);
    expect(geometry.w).toBe(24);
    expect(geometry.h).toBe(24);
  });
});

describe('canvasFontSize', () => {
  it('scales normalized font units into the 8..160 editor range', () => {
    const mapping = containFitMapping(1000, 1000);
    expect(canvasFontSize(50, mapping)).toBe(38); // 50/1000 of 760px.
    expect(canvasFontSize(500, mapping)).toBe(160); // clamped.
    expect(canvasFontSize(1, mapping)).toBe(8); // clamped.
  });
});

function textElement(overrides: Partial<MagicLayerElement> = {}): MagicLayerElement {
  return {
    kind: 'text',
    text: 'Hello',
    bounds: { x: 100, y: 100, w: 300, h: 60 },
    fontSize: 60,
    fontFamily: 'Arial',
    fontWeight: 'normal',
    italic: false,
    underline: false,
    color: '#111111',
    align: 'left',
    confidence: 0.9,
    ...overrides,
  } as MagicLayerElement;
}

function shapeElement(overrides: Partial<MagicLayerElement> = {}): MagicLayerElement {
  return {
    kind: 'shape',
    shape: 'rectangle',
    bounds: { x: 50, y: 500, w: 200, h: 100 },
    fill: '#ff0000',
    confidence: 0.8,
    ...overrides,
  } as MagicLayerElement;
}

function plan(elements: MagicLayerElement[], background: MagicLayerPlan['background'] = { kind: 'solid', color: '#ffffff' }): MagicLayerPlan {
  return { background, elements };
}

describe('validateMagicLayerPlan', () => {
  it('keeps a sane plan untouched and preserves painting order', () => {
    const input = plan([shapeElement(), textElement()]);
    const { plan: cleaned, dropped } = validateMagicLayerPlan(input);
    expect(cleaned.elements).toHaveLength(2);
    expect(cleaned.elements[0]!.kind).toBe('shape');
    expect(dropped).toHaveLength(0);
  });

  it('drops boxes too small to map to honest editable geometry', () => {
    const { plan: cleaned, dropped } = validateMagicLayerPlan(plan([textElement({ bounds: { x: 10, y: 10, w: 5, h: 5 } })]));
    expect(cleaned.elements).toHaveLength(0);
    expect(dropped[0]).toMatch(/too small/i);
  });

  it('drops boxes that extend beyond the image', () => {
    const { plan: cleaned } = validateMagicLayerPlan(plan([shapeElement({ bounds: { x: 900, y: 900, w: 200, h: 200 } })]));
    expect(cleaned.elements).toHaveLength(0);
  });

  it('deduplicates identical boxes regardless of order', () => {
    const first = textElement({ text: 'A', confidence: 0.4 });
    const second = textElement({ text: 'B', confidence: 0.9 });
    const { plan: cleaned } = validateMagicLayerPlan(plan([first, second]));
    expect(cleaned.elements).toHaveLength(1);
    expect(cleaned.elements[0]!.kind === 'text' && cleaned.elements[0].text).toBe('B');
  });

  it('caps the element list at the most confident entries', () => {
    const elements = Array.from({ length: 30 }, (_, index) => textElement({ bounds: { x: 10, y: index * 30, w: 100, h: 20 }, confidence: (index + 1) / 100 }));
    const { plan: cleaned, dropped } = validateMagicLayerPlan(plan(elements));
    expect(cleaned.elements).toHaveLength(MAGIC_LAYERS_MAX_ELEMENTS);
    expect(dropped[0]).toMatch(/most confident/);
  });

  it('sheds the least confident elements when boxes blanket the image', () => {
    // Four near-full-image boxes: together ~340% coverage; only one survives.
    const elements: MagicLayerElement[] = [0, 1, 2, 3].map((index) => shapeElement({
      bounds: { x: index * 20, y: index * 20, w: 950, h: 950 },
      confidence: 0.5 + index * 0.1,
    }));
    const { plan: cleaned, dropped } = validateMagicLayerPlan(plan(elements));
    const totalCoverage = cleaned.elements.reduce((total, element) => total + element.bounds.w * element.bounds.h, 0);
    expect(totalCoverage).toBeLessThanOrEqual(0.95 * 1_000_000);
    expect(dropped.length).toBeGreaterThan(0);
  });
});

describe('verifySolidBackground', () => {
  it('accepts a uniform border that matches the claim', () => {
    const image = { width: 200, height: 150, data: new Uint8ClampedArray(200 * 150 * 4) };
    for (let index = 0; index < image.data.length; index += 4) {
      image.data[index] = 255; image.data[index + 1] = 255; image.data[index + 2] = 255; image.data[index + 3] = 255;
    }
    const result = verifySolidBackground(image, '#ffffff');
    expect(result.verified).toBe(true);
    expect(result.measured).toBe('#ffffff');
  });

  it('rejects a photo border even when a colour was claimed', () => {
    const image = { width: 200, height: 150, data: new Uint8ClampedArray(200 * 150 * 4) };
    for (let y = 0; y < 150; y += 1) {
      for (let x = 0; x < 200; x += 1) {
        const offset = (y * 200 + x) * 4;
        image.data[offset] = (x * 255) / 200;
        image.data[offset + 1] = 120;
        image.data[offset + 2] = 90;
        image.data[offset + 3] = 255;
      }
    }
    const result = verifySolidBackground(image, '#80785a');
    expect(result.verified).toBe(false);
  });
});

describe('verifySolidShapeFill', () => {
  const image = { width: 200, height: 200, data: new Uint8ClampedArray(200 * 200 * 4) };

  it('accepts a flat fill that matches the claim', () => {
    const [r, g, b] = hex('#e11d48');
    for (let index = 0; index < image.data.length; index += 4) {
      image.data[index] = r; image.data[index + 1] = g; image.data[index + 2] = b; image.data[index + 3] = 255;
    }
    const result = verifySolidShapeFill(image, { x: 200, y: 200, w: 400, h: 300 }, '#e11d48');
    expect(result.verified).toBe(true);
    expect(result.measured).toBe('#e11d48');
  });

  it('rejects a gradient-filled region claimed as a flat shape', () => {
    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x < 200; x += 1) {
        const offset = (y * 200 + x) * 4;
        image.data[offset] = (x * 255) / 200;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = 255;
      }
    }
    const result = verifySolidShapeFill(image, { x: 200, y: 200, w: 400, h: 300 }, '#800000');
    expect(result.verified).toBe(false);
  });
});

describe('honestShapeKind', () => {
  it('keeps a circle whose box is square', () => {
    expect(honestShapeKind('circle', { w: 200, h: 190 })).toEqual({ shape: 'circle', downgraded: false });
  });
  it('downgrades a stretched circle to a rectangle rather than distorting it', () => {
    expect(honestShapeKind('circle', { w: 400, h: 100 })).toEqual({ shape: 'rectangle', downgraded: true });
    expect(honestShapeKind('square', { w: 300, h: 100 })).toEqual({ shape: 'rectangle', downgraded: true });
  });
});

describe('buildMagicLayerPage', () => {
  it('builds a solid-background page with native shape, heading and text in painting order', () => {
    const { page, warnings } = buildMagicLayerPage({
      background: { type: 'color', color: '#f8fafc' },
      elements: [
        { kind: 'shape', shape: 'rectangle', bounds: { x: 100, y: 100, w: 300, h: 200 }, fill: '#e11d48', renderedAs: 'native' },
        { kind: 'text', text: 'BIG TITLE', bounds: { x: 150, y: 400, w: 700, h: 90 }, fontSize: 90, color: '#111111', align: 'center' },
        { kind: 'text', text: 'supporting line', bounds: { x: 150, y: 520, w: 500, h: 40 }, fontSize: 40, color: '#333333', align: 'left' },
      ],
      imageWidth: 1000,
      imageHeight: 1000,
      seed: 'poster.png',
    });
    expect(warnings).toHaveLength(0);
    expect(page.size).toBe('square');
    expect(page.bg).toBe('#f8fafc');
    expect(page.backgroundImage).toBeUndefined();
    expect(page.blocks.map((block) => block.type)).toEqual(['shape', 'heading', 'text']);
    const heading = page.blocks[1]!;
    expect(heading.type === 'heading' && heading.level).toBe(1); // 90 units → 68px ≥ 58.
    const text = page.blocks[2]!;
    expect(text.type === 'text' && text.size).toBe('lg'); // 40 units → 30px ≥ 22.
    // Painting order is the z-order: the bottom-most element is first.
    expect(page.blocks[0]!.type).toBe('shape');
  });

  it('uses the cleaned raster as the page background when no solid colour is verified', () => {
    const { page } = buildMagicLayerPage({
      background: { type: 'image', src: '/api/brands/a/content/b/assets/c', alt: 'cleaned background' },
      elements: [],
      imageWidth: 1200,
      imageHeight: 628,
      seed: 'ad.png',
    });
    expect(page.backgroundImage?.src).toBe('/api/brands/a/content/b/assets/c');
    expect(page.backgroundImage?.fit).toBe('contain');
    expect(page.size).toBe('landscapeSocial');
  });

  it('passes shape rotation through to the block geometry', () => {
    const { page } = buildMagicLayerPage({
      background: { type: 'color', color: '#ffffff' },
      elements: [{ kind: 'shape', shape: 'rectangle', bounds: { x: 100, y: 100, w: 300, h: 200 }, fill: '#00ff00', rotation: -12, renderedAs: 'native' }],
      imageWidth: 1000,
      imageHeight: 1000,
      seed: 'rot.png',
    });
    const shape = page.blocks[0]!;
    expect(shape.type === 'shape' && shape.geometry?.rotation).toBe(-12);
  });

  it('renders a downgraded shape and recovered images as managed-asset cutouts', () => {
    const { page } = buildMagicLayerPage({
      background: { type: 'color', color: '#ffffff' },
      elements: [
        { kind: 'shape', shape: 'rectangle', bounds: { x: 50, y: 50, w: 200, h: 200 }, fill: '#123456', renderedAs: 'image', url: '/api/brands/x/assets/1', description: 'gradient badge' },
        { kind: 'image', bounds: { x: 300, y: 300, w: 400, h: 400 }, url: '/api/brands/x/assets/2', description: 'product photo' },
      ],
      imageWidth: 1000,
      imageHeight: 1000,
      seed: 'ad2.png',
    });
    expect(page.blocks.every((block) => block.type === 'image')).toBe(true);
    expect(page.blocks[0]!.type === 'image' && page.blocks[0].alt).toBe('gradient badge');
  });

  it('skips cutouts without a stored asset and reports it', () => {
    const { page, warnings } = buildMagicLayerPage({
      background: { type: 'color', color: '#ffffff' },
      elements: [{ kind: 'image', bounds: { x: 100, y: 100, w: 300, h: 300 }, url: '', description: 'lost crop' }],
      imageWidth: 1000,
      imageHeight: 1000,
      seed: 'lost.png',
    });
    expect(page.blocks).toHaveLength(0);
    expect(warnings[0]).toMatch(/could not be stored/);
  });

  it('warns and stops at the document block limit', () => {
    const elements = Array.from({ length: 45 }, (_, index) => ({
      kind: 'text' as const,
      text: `line ${index}`,
      bounds: { x: 20, y: 20 + index * 20, w: 200, h: 16 },
      fontSize: 20,
      color: '#111111',
      align: 'left' as const,
    }));
    const { page, warnings } = buildMagicLayerPage({
      background: { type: 'color', color: '#ffffff' },
      elements,
      imageWidth: 1000,
      imageHeight: 2000,
      seed: 'dense.png',
    });
    expect(page.blocks).toHaveLength(40);
    expect(warnings[0]).toMatch(/Layer limit reached/);
  });
});

// ---------------------------------------------------------------------------
// Synthetic ground-truth evaluation: a poster raster with KNOWN element
// geometry is reconstructed through the real pure pipeline (validation,
// verification, erase, assembly) and measured against its ground truth.
// ---------------------------------------------------------------------------

describe('Magic Layers synthetic evaluation (ground-truth poster)', () => {
  const WIDTH = 1000;
  const HEIGHT = 1000;
  // Ground truth, in normalized 0..1000 units.
  const GT = {
    background: '#ffffff',
    badge: { bounds: { x: 100, y: 100, w: 300, h: 200 }, fill: '#e11d48' },
    headline: { bounds: { x: 150, y: 520, w: 700, h: 90 }, text: 'SUMMER SALE', color: '#111111' },
    sub: { bounds: { x: 150, y: 660, w: 400, h: 50 }, text: 'Up to 50% off', color: '#333333' },
  };

  function paintPoster(): { data: Uint8ClampedArray; headlineGlyphPixels: number } {
    const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    const [br, bg, bb] = hex(GT.background);
    for (let index = 0; index < data.length; index += 4) {
      data[index] = br; data[index + 1] = bg; data[index + 2] = bb; data[index + 3] = 255;
    }
    const fillBox = (bounds: { x: number; y: number; w: number; h: number }, color: [number, number, number], sparse: boolean) => {
      const x0 = Math.round(bounds.x * WIDTH / 1000);
      const y0 = Math.round(bounds.y * HEIGHT / 1000);
      const x1 = Math.round((bounds.x + bounds.w) * WIDTH / 1000);
      const y1 = Math.round((bounds.y + bounds.h) * HEIGHT / 1000);
      let painted = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          // Sparse "glyph" strokes for text: alternate pixel columns and rows,
          // roughly 25% coverage, like real glyphs inside a text box.
          if (sparse && (x + y) % 2 === 0) continue;
          const offset = (y * WIDTH + x) * 4;
          data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2]; data[offset + 3] = 255;
          painted += 1;
        }
      }
      return painted;
    };
    fillBox(GT.badge.bounds, hex(GT.badge.fill), false);
    const headlineGlyphPixels = fillBox(GT.headline.bounds, hex(GT.headline.color), true);
    fillBox(GT.sub.bounds, hex(GT.sub.color), true);
    return { data, headlineGlyphPixels };
  }

  it('reconstructs every element with exact geometry, order and no duplicated foreground', () => {
    const { data: sourceData, headlineGlyphPixels } = paintPoster();
    const source = { width: WIDTH, height: HEIGHT, data: sourceData };

    // 1. A "perfect detection" plan for the known ground truth.
    const rawPlan: MagicLayerPlan = {
      background: { kind: 'solid', color: GT.background },
      elements: [
        { kind: 'shape', shape: 'rectangle', bounds: GT.badge.bounds, fill: GT.badge.fill, confidence: 0.95 },
        { kind: 'text', text: GT.headline.text, bounds: GT.headline.bounds, fontSize: 90, color: GT.headline.color, align: 'center', confidence: 0.92 },
        { kind: 'text', text: GT.sub.text, bounds: GT.sub.bounds, fontSize: 45, color: GT.sub.color, align: 'left', confidence: 0.88 },
      ],
    };

    // 2. Server-side validation keeps everything.
    const { plan: validated, dropped } = validateMagicLayerPlan(rawPlan);
    expect(dropped).toHaveLength(0);
    expect(validated.elements).toHaveLength(3);

    // 3. Pixel verification of colour claims.
    const backgroundCheck = verifySolidBackground(source, GT.background);
    expect(backgroundCheck.verified).toBe(true);
    const badgeCheck = verifySolidShapeFill(source, GT.badge.bounds, GT.badge.fill);
    expect(badgeCheck.verified).toBe(true);
    // A dishonest claim (the badge is NOT blue) must fail verification.
    expect(verifySolidShapeFill(source, GT.badge.bounds, '#0000ff').verified).toBe(false);

    // 4. Background reconstruction: erase the badge region from a copy; the
    // text regions are erased through the existing glyph-mask path.
    const badgeBox = { x: GT.badge.bounds.x, y: GT.badge.bounds.y, w: GT.badge.bounds.w, h: GT.badge.bounds.h };
    const erased = eraseRasterRegionPixels(source, [badgeBox]);
    expect(erased.regions[0]!.status).toBe('filled');

    // No duplicated foreground: the badge colour is gone from its region in
    // the cleaned background, and nothing outside the erased boxes changed.
    let residualBadgePixels = 0;
    const x0 = Math.round(badgeBox.x * WIDTH / 1000);
    const y0 = Math.round(badgeBox.y * HEIGHT / 1000);
    const x1 = Math.round((badgeBox.x + badgeBox.w) * WIDTH / 1000);
    const y1 = Math.round((badgeBox.y + badgeBox.h) * HEIGHT / 1000);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const offset = (y * WIDTH + x) * 4;
        const distance = Math.hypot(erased.data[offset]! - 225, erased.data[offset + 1]! - 29, erased.data[offset + 2]! - 72);
        if (distance < 30) residualBadgePixels += 1;
      }
    }
    expect(residualBadgePixels).toBe(0);
    let changedOutside = 0;
    for (let offset = 0; offset < erased.data.length; offset += 4) {
      const x = (offset / 4) % WIDTH;
      const y = Math.floor(offset / 4 / WIDTH);
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      if (erased.data[offset] !== sourceData[offset] || erased.data[offset + 1] !== sourceData[offset + 1] || erased.data[offset + 2] !== sourceData[offset + 2]) changedOutside += 1;
    }
    expect(changedOutside).toBe(0);

    // 5. Document assembly against the same mapping used for the cutouts.
    const mapping = containFitMapping(WIDTH, HEIGHT);
    const { page, warnings } = buildMagicLayerPage({
      background: { type: 'color', color: backgroundCheck.measured },
      elements: [
        { kind: 'shape', shape: 'rectangle', bounds: GT.badge.bounds, fill: GT.badge.fill, renderedAs: 'native' },
        { kind: 'text', text: GT.headline.text, bounds: GT.headline.bounds, fontSize: 90, color: GT.headline.color, align: 'center' },
        { kind: 'text', text: GT.sub.text, bounds: GT.sub.bounds, fontSize: 45, color: GT.sub.color, align: 'left' },
      ],
      imageWidth: WIDTH,
      imageHeight: HEIGHT,
      seed: 'eval-poster.png',
    });
    expect(warnings).toHaveLength(0);
    expect(page.blocks).toHaveLength(3);
    expect(page.bg).toBe('#ffffff');

    // Geometry fidelity: each block lands exactly on the ground-truth mapping.
    const expectedBadge = mapBoxToCanvasGeometry(GT.badge.bounds, mapping);
    const badgeBlock = page.blocks[0]!;
    expect(badgeBlock.type === 'shape' && badgeBlock.geometry).toEqual(expectedBadge);
    const headlineBlock = page.blocks[1]!;
    const expectedHeadline = mapBoxToCanvasGeometry(GT.headline.bounds, mapping);
    expect(headlineBlock.type === 'heading' && headlineBlock.geometry).toEqual(expectedHeadline);

    // Stacking order preserved: badge (bottom) painted first.
    expect(page.blocks.map((block) => block.type)).toEqual(['shape', 'heading', 'text']);

    // Text recovered verbatim — never fabricated.
    expect(headlineBlock.type === 'heading' && headlineBlock.text).toBe(GT.headline.text);

    // Coverage sanity used by the validator's coverage gate.
    const coverage = validated.elements.reduce((total, element) => total + element.bounds.w * element.bounds.h, 0) / 1_000_000;
    expect(coverage).toBeLessThanOrEqual(0.95);

    // Real glyph pixels existed to erase (the sparse paint produced strokes).
    expect(headlineGlyphPixels).toBeGreaterThan(1000);
  });

  it('processes the full pure pipeline on a 1000×1000 raster well under two seconds', () => {
    const { data } = paintPoster();
    const source = { width: WIDTH, height: HEIGHT, data };
    const started = performance.now();
    eraseRasterRegionPixels(source, [GT.badge.bounds, GT.headline.bounds, GT.sub.bounds]);
    validateMagicLayerPlan({
      background: { kind: 'solid', color: '#ffffff' },
      elements: Array.from({ length: 24 }, (_, index) => textElement({ bounds: { x: 10, y: 10 + index * 40, w: 200, h: 30 } })),
    });
    buildMagicLayerPage({
      background: { type: 'image', src: '/api/brands/x/assets/y', alt: 'bg' },
      elements: [{ kind: 'image', bounds: GT.badge.bounds, url: '/api/brands/x/assets/z', description: 'badge' }],
      imageWidth: WIDTH,
      imageHeight: HEIGHT,
      seed: 'perf.png',
    });
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(2_000);
  });
});
