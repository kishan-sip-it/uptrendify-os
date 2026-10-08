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
  const cleaned = cssText.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const add = (hex: string, weight = 1, evidenceSource = source) => {
    const entry = sink.get(hex) ?? { count: 0, sources: new Set<string>() };
    entry.count += weight;
    entry.sources.add(evidenceSource);
    sink.set(hex, entry);
  };

  for (const match of cleaned.matchAll(COLOR_TOKEN)) {
    const hex = parseCssColor(match[0]);
    if (!hex) continue;
    add(hex);
  }

  const semanticDecl = /--(?:brand|primary|secondary|accent|color-primary|color-secondary|brand-color)(?:-[a-z0-9-]+)?\s*:\s*([^;}]+)/gi;
  for (const match of cleaned.matchAll(semanticDecl)) {
    const hex = parseCssColor(match[1] ?? '');
    if (!hex) continue;
    add(hex, 6, 'semantic-css');
  }
}

function collectSemanticUiColors(html: string, $: cheerio.CheerioAPI, sink: Map<string, { count: number; sources: Set<string> }>): void {
  const add = (raw: string | undefined, weight: number, source: string) => {
    const hex = parseCssColor(raw);
    if (!hex) return;
    const entry = sink.get(hex) ?? { count: 0, sources: new Set<string>() };
    entry.count += weight;
    entry.sources.add(source);
    sink.set(hex, entry);
  };

  $('header a, nav a, header button, nav button, [role="banner"] a, [role="banner"] button').each((_i, el) => {
    const style = $(el).attr('style') ?? '';
    for (const match of style.matchAll(/(?:color|background(?:-color)?)\s*:\s*([^;}]+)/gi)) add(match[1], 4, 'header-ui');
    const classes = [$(el).attr('class'), $(el).attr('id')].filter(Boolean).join(' ');
    if (/(primary|brand|cta|button)/i.test(classes)) {
      for (const match of style.matchAll(/(?:color|background(?:-color)?)\s*:\s*([^;}]+)/gi)) add(match[1], 3, 'primary-control');
    }
  });

  $('button, [role="button"], a').each((_i, el) => {
    const classes = [$(el).attr('class'), $(el).attr('id')].filter(Boolean).join(' ');
    if (!/(primary|brand|cta|accent|button|link)/i.test(classes)) return;
    const style = $(el).attr('style') ?? '';
    for (const match of style.matchAll(/(?:color|background(?:-color)?)\s*:\s*([^;}]+)/gi)) add(match[1], 2, 'primary-control');
  });

  void html;
}

export function rankPalette(sink: Map<string, { count: number; sources: Set<string> }>, limit = 8): ExtractedColor[] {
  const scored = Array.from(sink.entries()).map(([hex, entry]) => {
    const saturation = saturationOf(hex);
    const luminance = relativeLuminance(hex);
    const sources = Array.from(entry.sources);
    const semantic = sources.some((source) => source === 'semantic-css' || source === 'meta-theme-color');
    const uiSignal = sources.some((source) => source === 'header-ui' || source === 'nav-ui' || source === 'primary-control' || source === 'link-accent');
    const neutralPenalty = isNeutral(hex) ? 0.18 : 1;
    const deliberateBoost = semantic ? 3.5 : uiSignal ? 2.5 : 1;
    const sourceDiversity = 1 + Math.min(sources.length, 5) * 0.06;
    const prominence = round(
      Math.log2(1 + entry.count) *
      (0.35 + saturation) *
      deliberateBoost *
      sourceDiversity *
      neutralPenalty *
      (luminance > 0.985 || luminance < 0.015 ? 0.25 : 1),
    );
    return {
      hex,
      occurrences: entry.count,
      saturation,
      prominence,
      role: 'neutral' as const,
      sources,
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
    return { ...color, role };
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

function sameSiteUrl(base: string | null, candidate: string): boolean {
  if (!base) return true;
  try {
    const rootHost = new URL(base).hostname.toLowerCase().replace(/^www\./, '');
    const candidateHost = new URL(candidate).hostname.toLowerCase().replace(/^www\./, '');
    return candidateHost === rootHost || candidateHost.endsWith('.' + rootHost);
  } catch {
    return false;
  }
}

function detectLogo($: cheerio.CheerioAPI, base: string | null): { logo: string | null; favicon: string | null } {
  const rootHost = base ? (() => { try { return new URL(base).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } })() : '';
  const rootToken = rootHost.split('.')[0] ?? '';
  const candidates: Array<{ url: string; score: number }> = [];
  let faviconUrl: string | null = null;
  let faviconScore = -1;

  const addCandidate = (url: string | null, score: number) => {
    if (!url || !sameSiteUrl(base, url)) return;
    candidates.push({ url, score });
  };

  $('img, picture img, picture source').each((_i, el) => {
    const node = $(el);
    const url = absoluteUrl(
      node.attr('src') ?? node.attr('data-src') ?? node.attr('data-lazy-src') ?? node.attr('srcset')?.split(',')[0]?.trim().split(' ')[0],
      base,
    );
    if (!url) return;

    const alt = [node.attr('alt'), node.attr('aria-label'), node.attr('title')].filter(Boolean).join(' ');
    const classes = [node.attr('class'), node.attr('id')].filter(Boolean).join(' ');
    const parent = $(el).closest('a,header,nav,[role="banner"]').first();
    const parentText = parent.text().replace(/\s+/g, ' ').trim().slice(0, 180);
    const href = parent.is('a') ? absoluteUrl(parent.attr('href'), base) : null;
    const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ''; } })();

    let score = 0;
    if (LOGO_HINT.test(path)) score += 55;
    if (LOGO_HINT.test(alt)) score += 50;
    if (/(brand|wordmark|masthead)/i.test(classes)) score += 28;
    if (/(header|nav|banner)/i.test(classes)) score += 18;
    if (parent.is('header') || parent.is('nav') || parent.is('[role="banner"]')) score += 22;
    if (href && (href === base || (rootHost && new URL(href).hostname.toLowerCase().replace(/^www\./, '') === rootHost))) score += 25;
    if (rootToken && path.includes(rootToken)) score += 8;
    if (/(stripe|paypal|visa|mastercard|partner|sponsor|customer|testimonial|case-study|twitter-card|og-image|social-share|hero|screenshot|thumbnail)/i.test(path + ' ' + alt + ' ' + parentText)) score -= 60;
    if (/(^|\s)(logo|wordmark)(\s|$)/i.test(alt)) score += 15;

    // Dimensions and placement are useful semantic evidence when markup is sparse.
    const width = Number(node.attr('width') ?? 0);
    const height = Number(node.attr('height') ?? 0);
    if (width > 0 && height > 0) {
      const ratio = width / height;
      if (width <= 900 && height <= 400 && ratio >= 1.2 && ratio <= 8) score += 12;
      if (width <= 300 && height <= 300) score += 5;
      if (width >= 1000 || height >= 800) score -= 25;
    }

    addCandidate(url, score);
  });

  // SVG logos often appear inline rather than as <img>.
  $('svg').each((_i, el) => {
    const node = $(el);
    const text = [node.attr('aria-label'), node.attr('role'), node.attr('class'), node.attr('id')].filter(Boolean).join(' ');
    const parent = node.closest('a,header,nav,[role="banner"]').first();
    const href = parent.is('a') ? absoluteUrl(parent.attr('href'), base) : null;
    let score = 0;
    if (LOGO_HINT.test(text)) score += 75;
    if (parent.is('header') || parent.is('nav') || parent.is('[role="banner"]')) score += 30;
    if (href && rootHost) score += 15;
    // Inline SVG has no stable URL, so it is evidence but cannot become logoUrl.
    void score;
  });

  // JSON-LD organization/logo is stronger than social-preview metadata.
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const type = Array.isArray(node['@type']) ? node['@type'].join(' ') : String(node['@type'] ?? '');
        if (!/(Organization|Corporation|Brand|WebSite)/i.test(type)) continue;
        const logo = typeof node.logo === 'string' ? node.logo : node.logo?.url;
        addCandidate(absoluteUrl(logo, base), 80);
      }
    } catch {
      // Invalid JSON-LD is ignored rather than breaking deterministic extraction.
    }
  });

  // OpenGraph/Twitter images are social-preview evidence only and must not
  // outrank an actual first-party logo candidate.
  const og = absoluteUrl($('meta[property="og:image"]').first().attr('content'), base);
  const twitter = absoluteUrl($('meta[name="twitter:image"]').first().attr('content'), base);
  addCandidate(og, 5);
  addCandidate(twitter, 4);

  $('link[rel]').each((_i, el) => {
    const node = $(el);
    const rel = (node.attr('rel') ?? '').toLowerCase();
    const href = absoluteUrl(node.attr('href'), base);
    if (!href || !sameSiteUrl(base, href)) return;
    if (rel.includes('apple-touch-icon')) {
      const score = 32;
      if (!faviconUrl || score > faviconScore) { faviconUrl = href; faviconScore = score; }
    } else if (rel.split(/\s+/).some((value) => value === 'icon' || value === 'shortcut')) {
      const score = 26;
      if (!faviconUrl || score > faviconScore) { faviconUrl = href; faviconScore = score; }
    } else if (rel.includes('mask-icon')) {
      addCandidate(href, 28);
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  return { logo: candidates[0]?.url ?? null, favicon: faviconUrl };
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

  collectSemanticUiColors(html, $, sink);

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