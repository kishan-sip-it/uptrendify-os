import { describe, expect, it } from 'vitest';
import {
  STUDIO_ASSET_ALLOWED_TYPES,
  STUDIO_ASSET_MAX_BYTES,
  extensionFor,
  signatureMatches,
  sniffImageType,
  studioAssetStoragePath,
  studioAssetUrl,
} from './studio-asset-image';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function webpBytes(): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP at offset 8
  return bytes;
}

describe('studio asset image validation', () => {
  it('accepts real PNG/JPEG/WEBP signatures and rejects forged or truncated files', () => {
    const png = new Uint8Array([...PNG_MAGIC, 0, 0, 0, 0]);
    const jpeg = new Uint8Array([...JPEG_MAGIC, 0, 0]);
    expect(signatureMatches('image/png', png)).toBe(true);
    expect(signatureMatches('image/jpeg', jpeg)).toBe(true);
    expect(signatureMatches('image/webp', webpBytes())).toBe(true);
    // RIFF without WEBP at offset 8 is not a WebP file.
    const riffOnly = webpBytes();
    riffOnly[8] = 0x00;
    expect(signatureMatches('image/webp', riffOnly)).toBe(false);
    expect(signatureMatches('image/png', jpeg)).toBe(false);
    expect(signatureMatches('image/png', new Uint8Array(PNG_MAGIC.slice(0, 4)))).toBe(false);
    expect(signatureMatches('image/svg+xml', new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBe(false);
  });

  it('sniffs the real type from magic bytes, never trusting declared headers', () => {
    expect(sniffImageType(new Uint8Array([...PNG_MAGIC, 1, 2, 3]))).toBe('image/png');
    expect(sniffImageType(new Uint8Array([...JPEG_MAGIC, 9, 9]))).toBe('image/jpeg');
    expect(sniffImageType(webpBytes())).toBe('image/webp');
    expect(sniffImageType(new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x20]))).toBeNull(); // '<svg '
    expect(sniffImageType(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
  });

  it('keeps the asset contract: allowlist, size ceiling, storage path and managed URL shape', () => {
    expect([...STUDIO_ASSET_ALLOWED_TYPES].sort()).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(STUDIO_ASSET_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/webp')).toBe('webp');
    const path = studioAssetStoragePath('org-1', 'brand-2', 'content-3', 'asset-4', 'png');
    expect(path).toBe('org-1/brand-2/content-3/studio-assets/asset-4.png');
    // Must satisfy the document schema's managedStudioAssetPath (lowercase UUID shape).
    const brandId = 'e4c240a1-793e-4e58-ac66-90a17f512b20';
    const contentId = '4fe2c6e8-9369-40e2-a7ac-4ab8db1146c4';
    const assetId = '9f8b7c6d-5e4a-3b2c-1d0e-f1a2b3c4d5e6';
    expect(studioAssetUrl(brandId, contentId, assetId)).toBe(
      `/api/brands/${brandId}/content/${contentId}/assets/${assetId}`,
    );
  });
});
