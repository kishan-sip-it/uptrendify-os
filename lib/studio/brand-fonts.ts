/**
 * Brand font loading for the editor canvas. Uses the FontFace API against the
 * scan's resolved public font asset (woff2/woff/otf/ttf) — no arbitrary remote
 * CSS injection. Failures resolve to false so callers fall back cleanly.
 */

const loadedFamilies = new Set<string>();

export type BrandFontAsset = {
  family: string;
  fontAssetUrl?: string;
  fontAssetFormat?: 'woff2' | 'woff' | 'opentype' | 'truetype';
};

function formatString(format: BrandFontAsset['fontAssetFormat']): string | null {
  switch (format) {
    case 'woff2': return 'woff2';
    case 'woff': return 'woff';
    case 'opentype': return 'opentype';
    case 'truetype': return 'truetype';
    default: return null;
  }
}

/** Attempt to load one brand font family from its asset. Never throws. */
export async function ensureBrandFontLoaded(font: BrandFontAsset): Promise<boolean> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return false;
  const family = font.family?.trim();
  if (!family) return false;
  if (loadedFamilies.has(family)) return true;
  if (!font.fontAssetUrl || !/^https:\/\//i.test(font.fontAssetUrl)) return false;
  const format = formatString(font.fontAssetFormat);
  if (!format) return false;
  try {
    const face = new FontFace(family, `url(${font.fontAssetUrl}) format(${format})`, { display: 'swap' });
    await face.load();
    document.fonts.add(face);
    loadedFamilies.add(family);
    return true;
  } catch {
    return false;
  }
}

/** Load every brand font that has an asset; returns families that loaded. */
export async function ensureBrandFontsLoaded(fonts: BrandFontAsset[]): Promise<string[]> {
  const results = await Promise.all(fonts.map((font) => ensureBrandFontLoaded(font).then((ok) => (ok ? font.family.trim() : null))));
  return results.filter((family): family is string => Boolean(family));
}
