/**
 * Raster region operations for Magic Layers reconstruction.
 *
 * Companion to raster-text.ts (which erases glyph-like pixels by colour
 * mask). Here the unit is a whole reviewed REGION: when a recovered shape
 * or image element is lifted out of the flattened source, the pixels it
 * covered must be rebuilt in the background copy so the element never
 * appears twice — once as a layer and once baked into the background.
 *
 * The fill is deliberately simple and honest: each row inside the region is
 * rebuilt by linearly interpolating between the pixels just outside its left
 * and right edges. That is exact for flat and linear-gradient backgrounds
 * (the common case for marketing artwork) and an approximation for photos.
 * It never invents texture that is not present at the region's edges.
 */

export type RasterBounds = { x: number; y: number; w: number; h: number };

export type RasterRegionEraseStatus = 'filled' | 'no-edge-samples';

export type RasterRegionEraseResult = {
  data: Uint8ClampedArray;
  regions: Array<{ index: number; status: RasterRegionEraseStatus; changedPixels: number }>;
};

type RasterPixels = { width: number; height: number; data: Uint8ClampedArray };

function boxToPixels(bounds: RasterBounds, width: number, height: number) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(bounds.x * width / 1000)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(bounds.y * height / 1000)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((bounds.x + bounds.w) * width / 1000)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil((bounds.y + bounds.h) * height / 1000)));
  return { x0, y0, x1, y1 };
}

function sampleColumn(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): [number, number, number] | null {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const offset = (y * width + x) * 4;
  if ((data[offset + 3] ?? 0) < 200) return null;
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
}

/** Median of up to three samples, robust to a stray anti-aliased edge pixel. */
function median3(values: Array<[number, number, number] | null>): [number, number, number] | null {
  const present = values.filter((value): value is [number, number, number] => value !== null);
  if (!present.length) return null;
  const channel = (index: 0 | 1 | 2) => {
    const sorted = present.map((value) => value[index]).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  return [channel(0), channel(1), channel(2)];
}

/**
 * Fill each reviewed region row by interpolating between the pixels just
 * outside the region's left and right edges (above/below when the region
 * spans the full image width). Only pixels INSIDE the reviewed boxes change.
 */
export function eraseRasterRegionPixels(
  source: RasterPixels,
  regions: RasterBounds[],
): RasterRegionEraseResult {
  const { width, height } = source;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      source.data.length !== width * height * 4) {
    throw new Error('Invalid raster pixel buffer.');
  }
  const data = new Uint8ClampedArray(source.data);
  const results: RasterRegionEraseResult['regions'] = [];

  regions.forEach((region, index) => {
    const { x0, y0, x1, y1 } = boxToPixels(region, width, height);
    const spansFullWidth = x0 === 0 && x1 === width;
    let changed = 0;
    let sawEdgeSample = false;

    for (let y = y0; y < y1; y += 1) {
      let left: [number, number, number] | null;
      let right: [number, number, number] | null;
      if (spansFullWidth) {
        // Nothing survives left/right of a full-width band; interpolate
        // vertically between the rows directly above and below the region.
        // Rows are strictly OUTSIDE the box (y0-1 above, y1 below).
        const centerX = Math.floor((x0 + x1) / 2);
        left = y0 > 0
          ? median3([sampleColumn(data, width, height, x0, y0 - 1), sampleColumn(data, width, height, centerX, y0 - 1), sampleColumn(data, width, height, x1 - 1, y0 - 1)])
          : null;
        right = y1 < height
          ? median3([sampleColumn(data, width, height, x0, y1), sampleColumn(data, width, height, centerX, y1), sampleColumn(data, width, height, x1 - 1, y1)])
          : null;
      } else {
        left = median3([sampleColumn(data, width, height, x0 - 1, y), sampleColumn(data, width, height, x0 - 2, y), sampleColumn(data, width, height, x0 - 3, y)]);
        right = median3([sampleColumn(data, width, height, x1, y), sampleColumn(data, width, height, x1 + 1, y), sampleColumn(data, width, height, Math.min(width - 1, x1 + 2), y)]);
      }
      // A box touching an image edge has only one usable side — fill flat
      // from it rather than skipping the row.
      const from = left ?? right;
      const to = right ?? left;
      if (!from || !to) continue; // No usable edge on this row; leave pixels untouched.
      sawEdgeSample = true;
      const span = Math.max(1, x1 - x0);
      for (let x = x0; x < x1; x += 1) {
        const t = (x - x0 + 0.5) / span;
        const offset = (y * width + x) * 4;
        data[offset] = Math.round(from[0] + (to[0] - from[0]) * t);
        data[offset + 1] = Math.round(from[1] + (to[1] - from[1]) * t);
        data[offset + 2] = Math.round(from[2] + (to[2] - from[2]) * t);
        data[offset + 3] = 255;
        changed += 1;
      }
    }

    results.push({ index, status: sawEdgeSample ? 'filled' : 'no-edge-samples', changedPixels: changed });
  });

  return { data, regions: results };
}

export type CroppedRaster = { width: number; height: number; data: Uint8ClampedArray };

/** Exact rectangular crop of a region, copied from the SOURCE pixels (never
 * the erased background copy) so a cutout keeps its original content. */
export function cropRasterRegion(source: RasterPixels, bounds: RasterBounds): CroppedRaster | null {
  const { width, height } = source;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      source.data.length !== width * height * 4) {
    return null;
  }
  const { x0, y0, x1, y1 } = boxToPixels(bounds, width, height);
  const cropWidth = x1 - x0;
  const cropHeight = y1 - y0;
  if (cropWidth < 1 || cropHeight < 1) return null;
  const data = new Uint8ClampedArray(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y += 1) {
    const sourceStart = ((y0 + y) * width + x0) * 4;
    data.set(source.data.subarray(sourceStart, sourceStart + cropWidth * 4), y * cropWidth * 4);
  }
  return { width: cropWidth, height: cropHeight, data };
}
