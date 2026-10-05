import * as cheerio from 'cheerio';

/**
 * Deterministic brand visual extraction.
 *
 * This module reads the website's own markup and CSS. It never asks a model
 * what a brand "should" look like, and it never invents a value: a field is
 * either supported by evidence found in the document, or it stays null and the
 * UI renders it as "not detected".
 *
 * Colour detection is frequency + saturation ranked, because the most repeated
 * declared colour on a page is almost always the brand colour, whereas a single
 * stray hex is usually chrome.
 */

export type ExtractedColor = {
  hex: string;
  /** How many times the colour was declared across the inspected evidence. */
  occurrences: number;
  /** 0-1. Higher means more colourful (brand-like), lower means neutral. */
  saturation: number;
  /** 0-1. Higher means more visually dominant. */
  prominence: number;
  role: 'primary' | 'secondary' | 'accent' | 'neutral';
  sources: string[];
};

export type ExtractedFont = {
  family: string;
  source: 'google-fonts' | 'css-declaration' | 'theme-font';
  evidence: string;
};

export type ExtractedIdentity = {
  finalUrl: string | null;
  brandName: string | null;
  description: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  palette: ExtractedColor[];
  primaryColor: string | null;
  secondaryColors: string[];
  accentColors: string[];
  fonts: ExtractedFont[];
  socialProfiles: { platform: string; url: string }[];
  /** Human-readable record of what was inspected, kept for provenance UI. */
  inspected: string[];
  warnings: string[];
};

const NEUTRAL_SATURATION_MAX = 0.12;
const NEUTRAL_LIGHT_MIN = 0.92;
const NEUTRAL_DARK_MAX = 0.08;

const SOCIAL_HOSTS: { platform: string; test: (host: string) => boolean }[] = [
  { platform: 'LinkedIn', test: (h) => h === 'linkedin.com' || h.endsWith('.linkedin.com') },
  { platform: 'X', test: (h) => h === 'x.com' || h === 'twitter.com' },
  { platform: 'Instagram', test: (h) => h === 'instagram.com' || h.endsWith('.instagram.com') },
  { platform: 'Facebook', test: (h) => h === 'facebook.com' || h.endsWith('.facebook.com') },
  { platform: 'YouTube', test: (h) => h === 'youtube.com' || h.endsWith('.youtube.com') },
  { platform: 'TikTok', test: (h) => h === 'tiktok.com' || h.endsWith('.tiktok.com') },
];

const LOGO_HINT = /(logo|wordmark|brandmark|brand-logo)/i;
const FAVICON_HINT = /(favicon|apple-touch-icon|icon)/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function normalizeHex(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim().toLowerCase();
  if (value.startsWith('#')) value = value.slice(1);
  if (/^[0-9a-f]{3}$/.test(value)) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-f]{6}$/.test(value)) return null;
  return `#${value}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clampByte = (v: number) => clamp(Math.round(v), 0, 255);
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')}`;
}

export function parseCssColor(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value || value === 'transparent' || value === 'currentcolor' || value === 'inherit') return null;

  const hex = normalizeHex(value);
  if (hex) return hex;

  const rgbMatch = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgbMatch) {
    return rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  }

  const hslMatch = value.match(/^hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (hslMatch) {
    const h = Number(hslMatch[1]) / 360;
    const s = clamp(Number(hslMatch[2]) / 100, 0, 1);
    const l = clamp(Number(hslMatch[3]) / 100, 0, 1);
    if (s === 0) return rgbToHex(l * 255, l * 255, l * 255);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t: number) => {
      let value2 = t;
      if (value2 < 0) value2 += 1;
      if (value2 > 1) value2 -= 1;
      if (value2 < 1 / 6) return p + (q - p) * 6 * value2;
      if (value2 < 1 / 2) return q;
      if (value2 < 2 / 3) return p + (q - p) * (2 / 3 - value2) * 6;
      return p;
    };
    return rgbToHex(channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255);
  }

  return null;
}

type Rgb = { r: number; g: number; b: number };

function toRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** Relative luminance per WCAG 2.x. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** HSL saturation, used to separate brand colours from greys. */
export function saturationOf(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  if (max === min) return 0;
  return round((max - min) / (1 - Math.abs(2 * lightness - 1)));
}

export function isNeutral(hex: string): boolean {
  const saturation = saturationOf(hex);
  const luminance = relativeLuminance(hex);
  return saturation <= NEUTRAL_SATURATION_MAX || luminance >= NEUTRAL_LIGHT_MIN || luminance <= NEUTRAL_DARK_MAX;
}

/** Pick whichever of black/white keeps text readable on the given brand colour. */
export function readableTextOn(hex: string): '#0f172a' | '#ffffff' {
  return relativeLuminance(hex) > 0.45 ? '#0f172a' : '#ffffff';
}

const COLOR_TOKEN = /(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/g;

function collectColors(cssText: string, source: string, sink: Map<string, { count: number; sources: Set<string> }>): void {
  // Strip comments so commented-out legacy colours are not counted.
  const cleaned = cssText.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const match of cleaned.matchAll(COLOR_TOKEN)) {
    const hex = parseCssColor(match[0]);
    if (!hex) continue;
    const entry = sink.get(hex) ?? { count: 0, sources: new Set<string>() };
    entry.count += 1;
    entry.sources.add(source);
    sink.set(hex, entry);
  }
}

export function rankPalette(sink: Map<string, { count: number; sources: Set<string> }>, limit = 8): ExtractedColor[] {
  const scored = Array.from(sink.entries()).map(([hex, entry]) => {
    const saturation = saturationOf(hex);
    const luminance = relativeLuminance(hex);
    // Repetition is the strongest signal; saturation separates brand from grey.
    const prominence = round(Math.log2(1 + entry.count) * (0.45 + saturation));
    return {
      hex,
      occurrences: entry.count,
      saturation,
      prominence,
      role: 'neutral' as const,
      sources: Array.from(entry.sources),
      _luminance: luminance,
    };
  });

  const chromatic = scored.filter((c) => !isNeutral(c.hex)).sort((a, b) => b.prominence - a.prominence);
  const neutral = scored.filter((c) => isNeutral(c.hex)).sort((a, b) => b.prominence - a.prominence);

  const ordered = [...chromatic, ...neutral].slice(0, limit);
  const chromaticCount = chromatic.length;

  return ordered.map((color, index) => {
    let role: ExtractedColor['role'] = 'neutral';
    if (!isNeutral(color.hex)) {
      if (index === 0) role = 'primary';
      else if (index < chromaticCount) role = 'secondary';
      else role = 'accent';
    }
    const { _luminance, ...rest } = color;
    return { ...rest, role };
  });
}

function absoluteUrl(candidate: string | undefined, base: string | null): string | null {
  if (!candidate) return null;
  const value = candidate.trim();
  if (!value || value.startsWith('data:') || value.startsWith('javascript:')) return null;
  if (!base) return /^https?:\/\//i.test(value) ? value : null;
  try {
    const resolved = new URL(value, base);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.toString() : null;
  } catch {
    return null;
  }
}

function detectFonts(html: string, cssText: string, $: cheerio.CheerioAPI): ExtractedFont[] {
  const found = new Map<string, ExtractedFont>();

  const add = (family: string | null, source: ExtractedFont['source'], evidence: string) => {
    if (!family) return;
    const cleaned = family
      .split(',')[0]
      .replace(/["']/g, '')
      .replace(/\b(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-monospace|ui-serif)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length < 2 || cleaned.length > 60) return;
    const key = cleaned.toLowerCase();
    if (!found.has(key)) found.set(key, { family: cleaned, source, evidence });
  };

  $('link[href*="fonts.googleapis.com"]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    const families = [...href.matchAll(/family=([^&:]+)/g)].map((m) => m[1]?.split('+').join(' '));
    const weights = href.match(/family=([^&]*)/)?.[1] ?? '';
    for (const family of families) add(family, 'google-fonts', weights.slice(0, 80));
  });

  for (const match of cssText.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    add(match[1] ?? null, 'css-declaration', (match[0] ?? '').slice(0, 80));
  }

  const themeColor = $('meta[name="theme-color"]').first().attr('content');
  void themeColor;
  void html;

  return Array.from(found.values()).slice(0, 6);
}

function detectLogo($: cheerio.CheerioAPI, base: string | null): { logo: string | null; favicon: string | null } {
  const ogImage = $('meta[property="og:image"]').first().attr('content');
  const twitterImage = $('meta[name="twitter:image"]').first().attr('content');

  let logo: string | null = null;
  let favicon: string | null = null;

  $('img').each((_i, el) => {
    if (logo) return;
    const node = $(el);
    const src = node.attr('src') ?? '';
    const candidates = [src, node.attr('data-src') ?? '', node.attr('data-lazy-src') ?? ''];
    const alt = node.attr('alt') ?? '';
    for (const candidate of candidates) {
      if (!candidate) continue;
      const resolved = absoluteUrl(candidate, base);
      if (!resolved) continue;
      if (LOGO_HINT.test(resolved) || LOGO_HINT.test(alt)) {
        logo = resolved;
        return;
      }
      if (!favicon && FAVICON_HINT.test(resolved)) favicon = resolved;
    }
  });

  if (!logo) logo = absoluteUrl(ogImage, base) ?? absoluteUrl(twitterImage, base);

  $('link[rel]').each((_i, el) => {
    const node = $(el);
    const rel = (node.attr('rel') ?? '').toLowerCase();
    const href = absoluteUrl(node.attr('href'), base);
    if (!href) return;
    if (!favicon && (rel.includes('icon') || rel.includes('apple-touch'))) favicon = href;
    if (!logo && rel.includes('mask-icon')) logo = href;
  });

  return { logo, favicon };
}

function detectSocials($: cheerio.CheerioAPI, base: string | null): { platform: string; url: string }[] {
  const baseHost = base ? new URL(base).hostname.replace(/^www\./, '') : null;
  const found = new Map<string, { platform: string; url: string }>();

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    if (!/^https?:\/\//i.test(href)) return;
    let host: string;
    try {
      host = new URL(href).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return;
    }
    // Only trust third-party links that are not the brand's own domain.
    if (baseHost && (host === baseHost || host.endsWith('.' + baseHost))) return;
    const match = SOCIAL_HOSTS.find((entry) => entry.test(host));
    if (match && !found.has(match.platform)) {
      found.set(match.platform, { platform: match.platform, url: href.split('?')[0] });
    }
  });

  return Array.from(found.values()).slice(0, 6);
}

function cleanMetaText(value: string | undefined | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2) return null;
  return cleaned.slice(0, 400);
}

export function extractBrandIdentity(html: string, finalUrl: string | null): ExtractedIdentity {
  const warnings: string[] = [];
  const inspected: string[] = [];
  const $ = cheerio.load(html);

  const styleBlocks: string[] = [];
  $('style').each((_i, el) => {
    const text = $(el).text();
    if (text) styleBlocks.push(text);
  });
  const cssText = styleBlocks.join('\n');
  if (cssText.trim()) inspected.push('inline <style> blocks');
  else warnings.push('No inline stylesheet found on the page.');

  const sink = new Map<string, { count: number; sources: Set<string> }>();
  if (cssText.trim()) collectColors(cssText, 'inline-css', sink);

  let inlineStyleElements = 0;
  $('[style]').each((_i, el) => {
    const attr = $(el).attr('style') ?? '';
    if (attr.includes('color') || attr.includes('background')) {
      inlineStyleElements += 1;
      collectColors(attr, 'inline-style-attribute', sink);
    }
  });
  if (inlineStyleElements > 0) inspected.push(`${inlineStyleElements} inline style attribute(s)`);

  const themeColorHex = normalizeHex($('meta[name="theme-color"]').first().attr('content'));
  if (themeColorHex) {
    const entry = sink.get(themeColorHex) ?? { count: 0, sources: new Set<string>() };
    // A declared theme-color is a deliberate brand statement: weight it above
    // incidental repetition so it can lead the palette.
    entry.count += 12;
    entry.sources.add('meta-theme-color');
    sink.set(themeColorHex, entry);
    inspected.push('meta[name="theme-color"]');
  }

  const palette = rankPalette(sink);
  if (palette.length === 0) warnings.push('No usable colour declarations were found on the page.');

  const chromatic = palette.filter((c) => c.role !== 'neutral');
  const primaryColor = chromatic[0]?.hex ?? themeColorHex ?? null;
  const secondaryColors = chromatic.slice(1, 4).map((c) => c.hex);
  const accentColors = chromatic.slice(4, 8).map((c) => c.hex);

  const fonts = detectFonts(html, cssText, $);
  if (fonts.length) inspected.push('font declarations / font links');

  const { logo, favicon } = detectLogo($, finalUrl);
  if (logo) inspected.push('logo candidate image');
  if (favicon) inspected.push('favicon');

  const brandName =
    cleanMetaText($('meta[property="og:site_name"]').first().attr('content')) ??
    cleanMetaText($('meta[name="application-name"]').first().attr('content')) ??
    cleanMetaText($('meta[property="og:title"]').first().attr('content')) ??
    cleanMetaText($('title').first().text());

  const description =
    cleanMetaText($('meta[name="description"]').first().attr('content')) ??
    cleanMetaText($('meta[property="og:description"]').first().attr('content'));

  if (brandName) inspected.push('page title / site name meta');
  if (description) inspected.push('meta description');

  const socialProfiles = detectSocials($, finalUrl);
  if (socialProfiles.length) inspected.push(`${socialProfiles.length} social profile link(s)`);

  return {
    finalUrl,
    brandName,
    description,
    logoUrl: logo,
    faviconUrl: favicon,
    palette,
    primaryColor,
    secondaryColors,
    accentColors,
    fonts,
    socialProfiles,
    inspected,
    warnings,
  };
}