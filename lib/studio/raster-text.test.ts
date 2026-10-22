import { describe, expect, it } from 'vitest';
import { eraseRasterTextPixels } from './raster-text';

function whiteImage(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 245;
    data[i * 4 + 1] = 245;
    data[i * 4 + 2] = 245;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

describe('eraseRasterTextPixels', () => {
  it('removes dark glyph pixels and leaves pixels outside the selected box untouched', () => {
    const image = whiteImage(40, 20);
    for (let y = 7; y <= 12; y += 1) {
      for (let x = 10; x <= 14; x += 1) {
        const offset = (y * image.width + x) * 4;
        image.data[offset] = 15;
        image.data[offset + 1] = 15;
        image.data[offset + 2] = 15;
      }
    }
    const result = eraseRasterTextPixels(image, [{
      bounds: { x: 200, y: 300, w: 300, h: 400 },
      color: '#0f0f0f',
    }]);
    expect(result.regions[0]?.status).toBe('erased');
    expect(result.regions[0]?.changedPixels).toBeGreaterThan(0);
    const erased = (9 * image.width + 12) * 4;
    expect(result.data[erased]).toBeGreaterThan(150);
    const outside = (10 * image.width + 30) * 4;
    expect(result.data[outside]).toBe(image.data[outside]);
    expect(result.data[outside + 1]).toBe(image.data[outside + 1]);
    expect(result.data[outside + 2]).toBe(image.data[outside + 2]);
  });

  it('refuses to erase a box when the detected text colour covers most of it', () => {
    const image = whiteImage(20, 12);
    for (let y = 3; y < 9; y += 1) {
      for (let x = 4; x < 16; x += 1) {
        const offset = (y * image.width + x) * 4;
        image.data[offset] = 0;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
      }
    }
    const result = eraseRasterTextPixels(image, [{
      bounds: { x: 200, y: 200, w: 600, h: 500 },
      color: '#000000',
    }]);
    expect(result.regions[0]?.status).toBe('unsafe-coverage');
    expect(result.data).toEqual(image.data);
  });

  it('does not add a text layer when no pixels match the recognised text colour', () => {
    const image = whiteImage(40, 20);
    const result = eraseRasterTextPixels(image, [{
      bounds: { x: 200, y: 300, w: 300, h: 400 },
      color: '#00ff00',
    }]);
    expect(result.regions[0]?.status).toBe('no-foreground-match');
    expect(result.data).toEqual(image.data);
  });
});
