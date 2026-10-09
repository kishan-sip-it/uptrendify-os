import { inflateSync } from 'node:zlib';

export type RasterColorSample = { hex: string; count: number };

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function pngFrameFromIco(bytes: Uint8Array): Uint8Array | null {
  if (isPng(bytes)) return bytes;
  if (bytes.length < 22 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4, true);
  for (let index = 0; index < Math.min(count, 8); index += 1) {
    const entry = 6 + index * 16;
    if (entry + 16 > bytes.length) break;
    const size = view.getUint32(entry + 8, true);
    const offset = view.getUint32(entry + 12, true);
    if (size < 8 || offset + size > bytes.length) continue;
    const frame = bytes.subarray(offset, offset + size);
    if (isPng(frame)) return frame;
  }
  return null;
}

function bitmapPaletteFromIco(bytes: Uint8Array, limit: number): RasterColorSample[] {
  if (bytes.length < 22 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4, true);
  const frames: Array<{ offset: number; length: number; area: number }> = [];
  for (let index = 0; index < Math.min(count, 8); index += 1) {
    const entry = 6 + index * 16;
    if (entry + 16 > bytes.length) break;
    const width = bytes[entry] || 256;
    const height = bytes[entry + 1] || 256;
    const length = view.getUint32(entry + 8, true);
    const offset = view.getUint32(entry + 12, true);
    if (length >= 40 && offset + length <= bytes.length) frames.push({ offset, length, area: width * height });
  }
  frames.sort((a, b) => b.area - a.area);
  for (const frame of frames) {
    const offset = frame.offset;
    const headerSize = view.getUint32(offset, true);
    if (headerSize < 40 || headerSize > frame.length) continue;
    const dibWidth = view.getInt32(offset + 4, true);
    const dibHeight = view.getInt32(offset + 8, true);
    const planes = view.getUint16(offset + 12, true);
    const bitDepth = view.getUint16(offset + 14, true);
    const compression = view.getUint32(offset + 16, true);
    if (dibWidth <= 0 || dibWidth > 1024 || dibHeight === 0 || planes !== 1 || ![24, 32].includes(bitDepth) || compression !== 0) continue;
    const width = dibWidth;
    const height = Math.floor(Math.abs(dibHeight) / 2);
    if (!height || height > 1024 || width * height > 750_000) continue;
    const rowBytes = Math.floor((width * bitDepth + 31) / 32) * 4;
    const pixelBytes = rowBytes * height;
    const pixelOffset = offset + headerSize;
    if (pixelOffset + pixelBytes > offset + frame.length) continue;
    const bytesPerPixel = bitDepth / 8;
    const rawPixels: Array<{ r: number; g: number; b: number; a: number }> = [];
    let alphaHasSignal = false;
    for (let y = 0; y < height; y += 1) {
      const sourceY = dibHeight > 0 ? height - 1 - y : y;
      const rowStart = pixelOffset + sourceY * rowBytes;
      for (let x = 0; x < width; x += 1) {
        const index = rowStart + x * bytesPerPixel;
        const b = bytes[index]!;
        const g = bytes[index + 1]!;
        const r = bytes[index + 2]!;
        const a = bitDepth === 32 ? bytes[index + 3]! : 255;
        if (a > 0) alphaHasSignal = true;
        rawPixels.push({ r, g, b, a });
      }
    }
    const counts = new Map<string, number>();
    for (const pixel of rawPixels) {
      const alpha = bitDepth === 32 && alphaHasSignal ? pixel.a : 255;
      if (alpha < 96) continue;
      const hex = rgbaToHex(pixel.r, pixel.g, pixel.b);
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    if (counts.size) {
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.max(1, Math.min(24, limit)))
        .map(([hex, colorCount]) => ({ hex, count: colorCount }));
    }
  }
  return [];
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('');
}

export function extractRasterPalette(input: Uint8Array, limit = 12): RasterColorSample[] {
  const png = pngFrameFromIco(input);
  if (!png) return bitmapPaletteFromIco(input, limit);
  if (png.length < 33) return [];

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const compressed: Uint8Array[] = [];

  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset);
    if (length > 1_000_000 || offset + length + 12 > png.length) return [];
    const type = String.fromCharCode(png[offset + 4]!, png[offset + 5]!, png[offset + 6]!, png[offset + 7]!);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      if (data.length !== 13) return [];
      const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = header.getUint32(0);
      height = header.getUint32(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === 'PLTE') {
      palette = data.slice();
    } else if (type === 'tRNS') {
      transparency = data.slice();
    } else if (type === 'IDAT') {
      compressed.push(data.slice());
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  if (!width || !height || width > 1024 || height > 1024 || width * height > 750_000 || interlace !== 0) return [];
  const indexed = colorType === 3;
  if (!(colorType === 2 || colorType === 6 || indexed)) return [];
  if (indexed ? ![1, 2, 4, 8].includes(bitDepth) : bitDepth !== 8) return [];
  if (indexed && (!palette || palette.length < 3)) return [];
  if (!compressed.length) return [];

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const bitsPerPixel = channels * bitDepth;
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
  let raw: Uint8Array;
  try {
    raw = inflateSync(Buffer.concat(compressed.map((chunk) => Buffer.from(chunk))), {
      maxOutputLength: (rowBytes + 1) * height,
    });
  } catch {
    return [];
  }
  if (raw.length < (rowBytes + 1) * height) return [];

  const pixels = new Uint8Array(rowBytes * height);
  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++]!;
    const rowStart = y * rowBytes;
    const prevStart = rowStart - rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const value = raw[rawOffset++]!;
      const left = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel]! : 0;
      const up = y > 0 ? pixels[prevStart + x]! : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[prevStart + x - bytesPerPixel]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      } else if (filter !== 0) return [];
      pixels[rowStart + x] = (value + predictor) & 0xff;
    }
  }

  const counts = new Map<string, number>();
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowBytes;
    for (let x = 0; x < width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 255;
      if (indexed) {
        const bitOffset = x * bitDepth;
        const byte = pixels[rowStart + Math.floor(bitOffset / 8)]!;
        const shift = 8 - bitDepth - (bitOffset % 8);
        const indexMask = (1 << bitDepth) - 1;
        const colorIndex = (byte >> shift) & indexMask;
        if (!palette) continue;
        const paletteOffset = colorIndex * 3;
        if (paletteOffset + 2 >= palette.length) continue;
        red = palette[paletteOffset]!;
        green = palette[paletteOffset + 1]!;
        blue = palette[paletteOffset + 2]!;
        alpha = transparency?.[colorIndex] ?? 255;
      } else {
        const index = rowStart + x * channels;
        red = pixels[index]!;
        green = pixels[index + 1]!;
        blue = pixels[index + 2]!;
        if (colorType === 6) alpha = pixels[index + 3]!;
      }
      if (alpha < 96) continue;
      const hex = rgbaToHex(red, green, blue);
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, Math.min(24, limit)))
    .map(([hex, count]) => ({ hex, count }));
}
