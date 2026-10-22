export type RasterTextBounds = { x: number; y: number; w: number; h: number };

export type RasterTextRegion = {
  bounds: RasterTextBounds;
  color: string;
};

export type RasterTextEraseStatus = 'erased' | 'no-foreground-match' | 'unsafe-coverage' | 'no-background-samples';

export type RasterTextEraseResult = {
  data: Uint8ClampedArray;
  regions: Array<{ index: number; status: RasterTextEraseStatus; foregroundPixels: number; changedPixels: number }>;
};

type RasterPixels = { width: number; height: number; data: Uint8ClampedArray };

function parseHex(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  return [
    Number.parseInt(match[1]!.slice(0, 2), 16),
    Number.parseInt(match[1]!.slice(2, 4), 16),
    Number.parseInt(match[1]!.slice(4, 6), 16),
  ];
}

function distance(r: number, g: number, b: number, color: [number, number, number]): number {
  const dr = r - color[0];
  const dg = g - color[1];
  const db = b - color[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? null;
}

/** Samples only a narrow ring outside the selected text box, not the box interior. */
function sampleBackground(
  image: RasterPixels,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number] | null {
  const channels: [number[], number[], number[]] = [[], [], []];
  const { width, height, data } = image;
  const stepX = Math.max(1, Math.floor((x1 - x0) / 24));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 24));
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 4;
    if ((data[offset + 3] ?? 0) < 200) return;
    channels[0].push(data[offset] ?? 0);
    channels[1].push(data[offset + 1] ?? 0);
    channels[2].push(data[offset + 2] ?? 0);
  };
  // Multiple thin rings make the estimate less sensitive to a one-pixel edge.
  for (const gap of [2, 4, 6]) {
    for (let x = x0; x < x1; x += stepX) {
      add(x, y0 - gap);
      add(x, y1 - 1 + gap);
    }
    for (let y = y0; y < y1; y += stepY) {
      add(x0 - gap, y);
      add(x1 - 1 + gap, y);
    }
  }
  const r = median(channels[0]);
  const g = median(channels[1]);
  const b = median(channels[2]);
  return r === null || g === null || b === null ? null : [r, g, b];
}

/** Keep long, thin horizontal design rules out of the glyph mask. */
function filterHorizontalRules(
  candidates: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number[] {
  if (!candidates.length) return candidates;
  const candidateMask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  for (const pixel of candidates) candidateMask[pixel] = 1;
  const kept: number[] = [];
  const minimumRuleWidth = Math.max(24, Math.ceil((x1 - x0) * 0.22));
  const maximumRuleHeight = Math.max(2, Math.ceil((y1 - y0) * 0.06));

  for (const seed of candidates) {
    if (visited[seed]) continue;
    const component: number[] = [seed];
    visited[seed] = 1;
    let minX = seed % width, maxX = minX;
    let minY = Math.floor(seed / width), maxY = minY;
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const pixel = component[cursor]!;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
          const neighbour = ny * width + nx;
          if (candidateMask[neighbour] && !visited[neighbour]) {
            visited[neighbour] = 1;
            component.push(neighbour);
          }
        }
      }
    }
    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const isHorizontalRule =
      componentWidth >= minimumRuleWidth &&
      componentHeight <= maximumRuleHeight &&
      componentWidth / componentHeight >= 8;
    if (!isHorizontalRule) {
      for (const pixel of component) kept.push(pixel);
    }
  }
  return kept;
}

/**
 * Conservatively removes only pixels that resemble the selected text colour
 * inside a user-reviewed OCR box. The surrounding image pixels are never
 * overwritten. This is a light, local inpaint for flat/gradient artwork—not
 * a promise of photo-perfect reconstruction over complex textures.
 */
export function eraseRasterTextPixels(
  source: RasterPixels,
  regions: RasterTextRegion[],
): RasterTextEraseResult {
  const { width, height } = source;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      source.data.length !== width * height * 4) {
    throw new Error('Invalid raster pixel buffer.');
  }
  const data = new Uint8ClampedArray(source.data);
  const results: RasterTextEraseResult['regions'] = [];

  regions.forEach((region, index) => {
    const textColor = parseHex(region.color);
    if (!textColor) {
      results.push({ index, status: 'no-foreground-match', foregroundPixels: 0, changedPixels: 0 });
      return;
    }
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(region.bounds.x * width / 1000)));
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(region.bounds.y * height / 1000)));
    const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((region.bounds.x + region.bounds.w) * width / 1000)));
    const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil((region.bounds.y + region.bounds.h) * height / 1000)));
    const boxWidth = x1 - x0;
    const boxHeight = y1 - y0;
    const boxArea = boxWidth * boxHeight;
    const background = sampleBackground({ ...source, data }, x0, y0, x1, y1);
    if (!background) {
      results.push({ index, status: 'no-background-samples', foregroundPixels: 0, changedPixels: 0 });
      return;
    }

    const mask = new Uint8Array(width * height);
    const candidates: number[] = [];
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const offset = (y * width + x) * 4;
        if ((data[offset + 3] ?? 0) < 200) continue;
        const textDistance = distance(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, textColor);
        const backgroundDistance = distance(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, background);
        if (textDistance <= 125 && backgroundDistance >= 30) candidates.push(y * width + x);
      }
    }

    const glyphCandidates = filterHorizontalRules(candidates, width, height, x0, y0, x1, y1);
    if (glyphCandidates.length < Math.max(4, Math.floor(boxArea * 0.001))) {
      results.push({ index, status: 'no-foreground-match', foregroundPixels: glyphCandidates.length, changedPixels: 0 });
      return;
    }
    // If most of a selected box matches the text colour, the model's region is
    // probably wrong or covers a solid graphic. Refuse to erase it.
    if (glyphCandidates.length / boxArea > 0.58) {
      results.push({ index, status: 'unsafe-coverage', foregroundPixels: glyphCandidates.length, changedPixels: 0 });
      return;
    }

    for (const pixel of glyphCandidates) mask[pixel] = 1;
    // Inpaint only the detected glyph pixels; keep the mask inside the reviewed box.
    for (const pixel of glyphCandidates) {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= x0 && nx < x1 && ny >= y0 && ny < y1) mask[ny * width + nx] = 1;
        }
      }
    }

    const maskedPixels: number[] = [];
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const pixel = y * width + x;
        if (mask[pixel]) maskedPixels.push(pixel);
      }
    }
    const filled = new Uint8Array(width * height);
    for (let iteration = 0; iteration < 48; iteration += 1) {
      const updates: Array<{ pixel: number; rgba: [number, number, number, number] }> = [];
      for (const pixel of maskedPixels) {
        if (filled[pixel]) continue;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        let r = 0, g = 0, b = 0, a = 0, neighbours = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
            const near = ny * width + nx;
            if (mask[near] && !filled[near]) continue;
            const offset = near * 4;
            r += data[offset] ?? 0;
            g += data[offset + 1] ?? 0;
            b += data[offset + 2] ?? 0;
            a += data[offset + 3] ?? 255;
            neighbours += 1;
          }
        }
        if (neighbours) updates.push({ pixel, rgba: [r / neighbours, g / neighbours, b / neighbours, a / neighbours] });
      }
      if (!updates.length) break;
      for (const update of updates) {
        const offset = update.pixel * 4;
        data[offset] = update.rgba[0];
        data[offset + 1] = update.rgba[1];
        data[offset + 2] = update.rgba[2];
        data[offset + 3] = update.rgba[3];
        filled[update.pixel] = 1;
      }
    }
    // Any inner pixels not reached in 48 passes are filled from the nearby
    // boundary median instead of allowing original glyphs to remain visible.
    for (const pixel of maskedPixels) {
      if (filled[pixel]) continue;
      const offset = pixel * 4;
      data[offset] = background[0];
      data[offset + 1] = background[1];
      data[offset + 2] = background[2];
      filled[pixel] = 1;
    }
    results.push({ index, status: 'erased', foregroundPixels: candidates.length, changedPixels: maskedPixels.length });
  });

  return { data, regions: results };
}
