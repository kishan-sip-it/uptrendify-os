import { describe, expect, it } from 'vitest';
import { sampleBackgroundColorFromPixels } from './background-color';

function solidImage(width: number, height: number, color: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = color[0];
    data[index * 4 + 1] = color[1];
    data[index * 4 + 2] = color[2];
    data[index * 4 + 3] = 255;
  }
  return { width, height, data };
}

describe('sampleBackgroundColorFromPixels', () => {
  it('returns the exact canvas colour surrounding a text box', () => {
    const image = solidImage(100, 60, [18, 52, 86]);
    for (let y = 20; y < 35; y += 1) {
      for (let x = 20; x < 80; x += 1) {
        const offset = (y * image.width + x) * 4;
        image.data[offset] = 0; image.data[offset + 1] = 0; image.data[offset + 2] = 0;
      }
    }
    expect(sampleBackgroundColorFromPixels(image, { x: 20, y: 20, w: 60, h: 15 })).toBe('#123456');
  });

  it('prefers the dominant exact colour over a few antialiased edge pixels', () => {
    const image = solidImage(80, 50, [245, 246, 247]);
    for (let x = 10; x < 70; x += 1) {
      const offset = (19 * image.width + x) * 4;
      image.data[offset] = 110; image.data[offset + 1] = 111; image.data[offset + 2] = 112;
    }
    expect(sampleBackgroundColorFromPixels(image, { x: 10, y: 20, w: 60, h: 12 })).toBe('#f5f6f7');
  });

  it('returns null for invalid buffers or when no surrounding pixels exist', () => {
    expect(sampleBackgroundColorFromPixels({ width: 0, height: 0, data: new Uint8ClampedArray() }, { x: 0, y: 0, w: 0, h: 0 })).toBeNull();
    expect(sampleBackgroundColorFromPixels(solidImage(1, 1, [255, 255, 255]), { x: 0, y: 0, w: 1, h: 1 })).toBeNull();
  });
});
