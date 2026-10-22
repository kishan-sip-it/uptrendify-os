export type BackgroundSampleBounds = { x: number; y: number; w: number; h: number };
export type BackgroundPixelBuffer = { width: number; height: number; data: Uint8ClampedArray };

/** Returns the most common exact RGB value sampled just outside the selected text box. */
export function sampleBackgroundColorFromPixels(
  image: BackgroundPixelBuffer,
  bounds: BackgroundSampleBounds,
): string | null {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      data.length !== width * height * 4 ||
      ![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite) ||
      bounds.w <= 0 || bounds.h <= 0) return null;

  const x0 = Math.max(0, Math.min(width - 1, Math.floor(bounds.x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(bounds.y)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil(bounds.x + bounds.w)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil(bounds.y + bounds.h)));
  const margin = Math.max(2, Math.min(8, Math.round(Math.min(bounds.w, bounds.h) * 0.04)));
  const frequencies = new Map<number, number>();

  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 4;
    if ((data[offset + 3] ?? 0) < 200) return;
    const key = ((data[offset] ?? 0) << 16) | ((data[offset + 1] ?? 0) << 8) | (data[offset + 2] ?? 0);
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  };

  for (const gap of [1, margin]) {
    for (let x = x0; x < x1; x += 1) {
      add(x, y0 - gap);
      add(x, y1 - 1 + gap);
    }
    for (let y = y0; y < y1; y += 1) {
      add(x0 - gap, y);
      add(x1 - 1 + gap, y);
    }
  }
  if (!frequencies.size) return null;
  let best = 0;
  let count = -1;
  for (const [color, frequency] of frequencies) {
    if (frequency > count) { best = color; count = frequency; }
  }
  return '#' + best.toString(16).padStart(6, '0');
}
