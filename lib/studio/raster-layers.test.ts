import { describe, expect, it } from 'vitest';
import { cropRasterRegion, eraseRasterRegionPixels } from './raster-layers';

type Image = { width: number; height: number; data: Uint8ClampedArray };

function solid(width: number, height: number, color: [number, number, number]): Image {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = color[0]; data[index + 1] = color[1]; data[index + 2] = color[2]; data[index + 3] = 255;
  }
  return { width, height, data };
}

/** Horizontal black→white gradient: pixel value equals its x position. */
function horizontalGradient(width: number, height: number): Image {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = Math.round((x * 255) / (width - 1));
      data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('eraseRasterRegionPixels', () => {
  it('refills a region over a solid background with the exact surrounding colour', () => {
    const image = solid(100, 80, [240, 240, 240]);
    // A red block covering normalized box {x:300,y:200,w:400,h:200} = pixels 30..70 × 20..40.
    for (let y = 20; y < 40; y += 1) {
      for (let x = 30; x < 70; x += 1) {
        const offset = (y * 100 + x) * 4;
        image.data[offset] = 255; image.data[offset + 1] = 0; image.data[offset + 2] = 0;
      }
    }
    const result = eraseRasterRegionPixels(image, [{ x: 300, y: 200, w: 400, h: 200 }]);
    expect(result.regions[0]!.status).toBe('filled');
    // Normalized box maps to pixels 30..70 × 16..32 on the 100×80 raster.
    expect(result.regions[0]!.changedPixels).toBe(40 * 16);
    const offset = (30 * 100 + 45) * 4; // a pixel inside the erased box
    expect([result.data[offset], result.data[offset + 1], result.data[offset + 2]]).toEqual([240, 240, 240]);
  });

  it('reconstructs a linear-gradient background exactly by edge interpolation', () => {
    const image = horizontalGradient(200, 100);
    // The erased region must come back as the gradient it covered.
    const result = eraseRasterRegionPixels(image, [{ x: 300, y: 100, w: 400, h: 800 }]);
    expect(result.regions[0]!.status).toBe('filled');
    for (const x of [65, 80, 95, 110]) {
      const offset = (50 * 200 + x) * 4;
      const expected = Math.round((x * 255) / 199);
      expect(Math.abs(result.data[offset]! - expected)).toBeLessThanOrEqual(2);
    }
  });

  it('never changes pixels outside the reviewed box', () => {
    const image = horizontalGradient(200, 100);
    const result = eraseRasterRegionPixels(image, [{ x: 300, y: 100, w: 400, h: 800 }]);
    let changedOutside = 0;
    for (let offset = 0; offset < result.data.length; offset += 4) {
      const x = (offset / 4) % 200;
      const y = Math.floor(offset / 4 / 200);
      if (x >= 60 && x < 140 && y >= 10 && y < 90) continue;
      if (result.data[offset] !== image.data[offset]) changedOutside += 1;
    }
    expect(changedOutside).toBe(0);
  });

  it('falls back to the single available edge for boxes touching an image edge', () => {
    const image = solid(100, 100, [10, 20, 30]);
    // Red only INSIDE the box (pixels x<50, y<50 = normalized 0..500 × 0..500);
    // the right edge at x=50 stays the surrounding colour.
    for (let y = 0; y < 50; y += 1) {
      for (let x = 0; x < 50; x += 1) {
        const offset = (y * 100 + x) * 4;
        image.data[offset] = 200; image.data[offset + 1] = 0; image.data[offset + 2] = 0;
      }
    }
    const result = eraseRasterRegionPixels(image, [{ x: 0, y: 0, w: 500, h: 500 }]);
    expect(result.regions[0]!.status).toBe('filled');
    const offset = (25 * 100 + 10) * 4;
    expect([result.data[offset], result.data[offset + 1], result.data[offset + 2]]).toEqual([10, 20, 30]);
  });

  it('handles a full-width box by sampling strictly above and below the region', () => {
    const image = solid(100, 60, [1, 2, 3]);
    for (let y = 20; y < 40; y += 1) {
      for (let x = 0; x < 100; x += 1) {
        const offset = (y * 100 + x) * 4;
        image.data[offset] = 90; image.data[offset + 1] = 90; image.data[offset + 2] = 90;
      }
    }
    // Normalized {0, 333, 1000, 334} maps to rows 19..41 — a full-width band.
    const result = eraseRasterRegionPixels(image, [{ x: 0, y: 333, w: 1000, h: 334 }]);
    expect(result.regions[0]!.status).toBe('filled');
    const offset = (30 * 100 + 50) * 4;
    expect([result.data[offset], result.data[offset + 1], result.data[offset + 2]]).toEqual([1, 2, 3]);
  });

  it('refuses to invent pixels when the box covers the whole image', () => {
    const image = solid(8, 8, [9, 9, 9]);
    const result = eraseRasterRegionPixels(image, [{ x: 0, y: 0, w: 1000, h: 1000 }]);
    // No row or column outside the box exists — there is no honest fill source.
    expect(result.regions[0]!.status).toBe('no-edge-samples');
    expect(result.regions[0]!.changedPixels).toBe(0);
    // And nothing was modified.
    expect(Array.from(result.data)).toEqual(Array.from(image.data));
  });
});

describe('cropRasterRegion', () => {
  it('crops an exact copy of the region from the SOURCE pixels', () => {
    const image = horizontalGradient(200, 100);
    const crop = cropRasterRegion(image, { x: 250, y: 200, w: 250, h: 200 })!;
    expect(crop.width).toBe(50);
    expect(crop.height).toBe(20);
    // Crop pixel (25,10) is source pixel (75,30).
    const expectedOffset = (30 * 200 + 75) * 4;
    const cropOffset = (10 * 50 + 25) * 4;
    expect(crop.data[cropOffset]).toBe(image.data[expectedOffset]);
  });

  it('yields original content even after the same region was erased in a copy', () => {
    const image = solid(100, 100, [0, 0, 0]);
    for (let y = 10; y < 30; y += 1) {
      for (let x = 10; x < 30; x += 1) {
        const offset = (y * 100 + x) * 4;
        image.data[offset] = 250;
      }
    }
    const erased = eraseRasterRegionPixels(image, [{ x: 100, y: 100, w: 200, h: 200 }]);
    // The background copy no longer contains the red block…
    const erasedCenter = (20 * 100 + 20) * 4;
    expect(erased.data[erasedCenter]).toBe(0);
    // …but a cutout taken from the SOURCE still carries it, unduplicated.
    const crop = cropRasterRegion(image, { x: 100, y: 100, w: 200, h: 200 })!;
    const cropCenter = (10 * 20 + 10) * 4;
    expect(crop.data[cropCenter]).toBe(250);
  });

  it('returns null for invalid buffers', () => {
    expect(cropRasterRegion({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, { x: 0, y: 0, w: 100, h: 100 })).toBeNull();
  });
});
