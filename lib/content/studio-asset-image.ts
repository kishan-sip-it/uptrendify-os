/**
 * Shared image-asset validation contract for Studio uploads and the
 * server-side brand-logo import. One source of truth for the bucket, the
 * size ceiling, the MIME allowlist, the magic-byte signatures and the
 * storage path/URL shapes — the authenticated assets route and the brand
 * logo import route must never drift apart.
 */

export const STUDIO_ASSET_BUCKET = 'brand-assets';
// Lossless cleaned-image uploads may grow beyond the source file; request size remains below Vercel's default payload ceiling.
export const STUDIO_ASSET_MAX_BYTES = 4 * 1024 * 1024;
export const STUDIO_ASSET_ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const MAGIC: Record<string, Uint8Array> = {
  'image/png': Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': Uint8Array.from([0xff, 0xd8, 0xff]),
  'image/webp': Uint8Array.from([0x52, 0x49, 0x46, 0x46]),
};

export function extensionFor(type: string): string {
  return type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp';
}

export function signatureMatches(type: string, bytes: Uint8Array): boolean {
  const magic = MAGIC[type];
  if (!magic || bytes.length < magic.length || !magic.every((value, index) => bytes[index] === value)) return false;
  if (type === 'image/webp') return bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return true;
}

/** Detect the real image type from file magic bytes; null when none matches. */
export function sniffImageType(bytes: Uint8Array): string | null {
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    if (signatureMatches(type, bytes)) return type;
  }
  return null;
}

export function studioAssetStoragePath(organizationId: string, brandId: string, contentId: string, assetId: string, extension: string) {
  return `${organizationId}/${brandId}/${contentId}/studio-assets/${assetId}.${extension}`;
}

export function studioAssetUrl(brandId: string, contentId: string, assetId: string) {
  return `/api/brands/${brandId}/content/${contentId}/assets/${assetId}`;
}
