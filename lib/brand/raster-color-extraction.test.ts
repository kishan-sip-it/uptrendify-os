import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { extractRasterPalette } from './raster-color-extraction';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const name = Buffer.from(type);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, Buffer.from(data)])), 0);
  return Buffer.concat([header, name, Buffer.from(data), crc]);
}

function tinyRgbaPng(pixels: number[][]): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(pixels.length, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanline = Buffer.from([0, ...pixels.flat()]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanline)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('raster colour extraction', () => {
  it('extracts prominent non-transparent PNG colours', () => {
    const png = tinyRgbaPng([
      [227, 40, 54, 255],
      [227, 40, 54, 255],
      [255, 190, 0, 255],
      [0, 0, 255, 0],
    ]);
    expect(extractRasterPalette(png, 8)).toEqual([
      { hex: '#e32836', count: 2 },
      { hex: '#ffbe00', count: 1 },
    ]);
  });

  it('samples a legacy 32-bit BMP favicon frame inside an ICO container', () => {
    const header = Buffer.alloc(62);
    header[0] = 0;
    header[1] = 0;
    header[2] = 1;
    header[4] = 1;
    header[6] = 1;
    header[7] = 1;
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(48, 14);
    header.writeUInt32LE(22, 18);
    header.writeUInt32LE(40, 22);
    header.writeInt32LE(1, 26);
    header.writeInt32LE(2, 30);
    header.writeUInt16LE(1, 34);
    header.writeUInt16LE(32, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(8, 42);
    // One bottom-up BGRA pixel (red), followed by the 1-bit AND mask row.
    header.set([0, 0, 255, 255, 0, 0, 0, 0], 54);
    expect(extractRasterPalette(header)).toEqual([{ hex: '#ff0000', count: 1 }]);
  });

  it('ignores invalid and unsupported image bytes safely', () => {
    expect(extractRasterPalette(new Uint8Array([1, 2, 3, 4]))).toEqual([]);
  });

  it('extracts the PNG frame embedded in an ICO container', () => {
    const png = tinyRgbaPng([[16, 185, 129, 255]]);
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header[6] = 1;
    header[7] = 1;
    header[8] = 0;
    header[9] = 0;
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14);
    header.writeUInt32LE(22, 18);
    expect(extractRasterPalette(Buffer.concat([header, Buffer.from(png)]))).toEqual([
      { hex: '#10b981', count: 1 },
    ]);
  });
});
