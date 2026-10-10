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

/**
 * Flags public pages whose fetched HTML is only an application shell or
 * navigation chrome. These pages need the rendered-reader fallback even when
 * the server responds with HTTP 200.
 */
export function shouldUseRenderedWebsiteFallback(html: string): boolean {
  const $ = cheerio.load(html);
  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const metaDescription = $('meta[name="description"],meta[property="og:description"]')
    .first()
    .attr('content')?.trim() ?? '';
  $('script,style,noscript,svg,iframe,template').remove();

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const mainText = $('main,article,[role="main"]').text().replace(/\s+/g, ' ').trim();
  const headings = $('h1,h2,h3').toArray().filter((node) => $(node).text().replace(/\s+/g, ' ').trim().length > 0);
  const appShellMarker = /enable javascript|javascript is required|application is loading|loading application|please wait while we load/i;

  if (bodyText.length < 650) return true;
  if (mainText.length > 0 && mainText.length < 320 && bodyText.length < 1_500) return true;
  if (headings.length === 0 && bodyText.length < 1_800 && metaDescription.length < 120) return true;
  if (appShellMarker.test(bodyText) && bodyText.length < 5_000) return true;

  // A concise brochure page can be legitimate when it has real structure and
  // a meaningful title/description. Do not force a reader request for it.
  return !title && !metaDescription && headings.length === 0 && bodyText.length < 1_400;
}

function cssComponents(body: string): string[] {
  return body.replace(/,/g, ' ').replace(/\//g, ' ').trim().split(/\s+/).filter(Boolean);
}

function hueDegrees(token: string): number {
  const value = token.trim().toLowerCase();
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;
  if (value.endsWith('turn')) return numeric * 360;
  if (value.endsWith('rad')) return numeric * (180 / Math.PI);
  return numeric;
}

function parseRgbFunction(body: string): string | null {
  const parts = cssComponents(body);
  if (parts.length < 3) return null;
  const channel = (token: string) => token.endsWith('%')
    ? clamp(Number.parseFloat(token) * 2.55, 0, 255)
    : clamp(Number.parseFloat(token), 0, 255);
  const values = parts.slice(0, 3).map(channel);
  if (values.some((value) => !Number.isFinite(value))) return null;
  return rgbToHex(values[0]!, values[1]!, values[2]!);
}

function parseHslFunction(body: string): string | null {
  const parts = cssComponents(body);
  if (parts.length < 3) return null;
  const h = ((hueDegrees(parts[0]!) % 360) + 360) % 360 / 360;
  const s = clamp(Number.parseFloat(parts[1]!) / (parts[1]!.endsWith('%') ? 100 : 1), 0, 1);
  const l = clamp(Number.parseFloat(parts[2]!) / (parts[2]!.endsWith('%') ? 100 : 1), 0, 1);
  if (![h, s, l].every(Number.isFinite)) return null;
  if (s === 0) return rgbToHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return rgbToHex(channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255);
}

function linearToSrgb(value: number): number {
  const clamped = Math.max(0, value);
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function parseOklab(l: number, a: number, b: number): string {
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;
  const ll = lRoot ** 3;
  const mm = mRoot ** 3;
  const ss = sRoot ** 3;
  return rgbToHex(
    linearToSrgb(4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss) * 255,
    linearToSrgb(-1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss) * 255,
    linearToSrgb(-0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss) * 255,
  );
}

function parseOklabFunction(body: string): string | null {
  const parts = cssComponents(body);
  if (parts.length < 3) return null;
  const lightness = parts[0]!.endsWith('%')
    ? Number.parseFloat(parts[0]!) / 100
    : Number.parseFloat(parts[0]!);
  const axis = (token: string) => token.endsWith('%')
    ? Number.parseFloat(token) * 0.004
    : Number.parseFloat(token);
  const a = axis(parts[1]!);
  const b = axis(parts[2]!);
  if (![lightness, a, b].every(Number.isFinite)) return null;
  return parseOklab(clamp(lightness, 0, 1), a, b);
}

function parseOklchFunction(body: string): string | null {
  const parts = cssComponents(body);
  if (parts.length < 3) return null;
  const lightness = parts[0]!.endsWith('%')
    ? Number.parseFloat(parts[0]!) / 100
    : Number.parseFloat(parts[0]!);
  const chroma = Number.parseFloat(parts[1]!);
  const hue = hueDegrees(parts[2]!) * Math.PI / 180;
  if (![lightness, chroma, hue].every(Number.isFinite)) return null;
  return parseOklab(
    clamp(lightness, 0, 1),
    Math.max(0, chroma) * Math.cos(hue),
    Math.max(0, chroma) * Math.sin(hue),
  );
}

function parseBareHslTriplet(value: string): string | null {
  const parts = cssComponents(value);
  if (parts.length !== 3 || !parts[1]!.endsWith('%') || !parts[2]!.endsWith('%')) return null;
  return parseHslFunction(parts.join(' '));
}

const BASIC_CSS_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', tomato: '#ff6347',
  coral: '#ff7f50', gold: '#ffd700', indigo: '#4b0082', teal: '#008080', cyan: '#00ffff',
  magenta: '#ff00ff', navy: '#000080', lime: '#00ff00', olive: '#808000', maroon: '#800000',
  rebeccapurple: '#663399', transparent: '',
};

export function parseCssColor(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value || value === 'transparent' || value === 'currentcolor' || value === 'inherit' || value === 'initial' || value === 'unset') return null;

  const hex = normalizeHex(value);
  if (hex) return hex;
  if (BASIC_CSS_COLORS[value]) return BASIC_CSS_COLORS[value] || null;

  const functionMatch = value.match(/^([a-z-]+)\((.*)\)$/i);
  if (functionMatch) {
    const name = functionMatch[1]!.toLowerCase();
    const body = functionMatch[2]!;
    if (name === 'rgb' || name === 'rgba') return parseRgbFunction(body);
    if (name === 'hsl' || name === 'hsla') return parseHslFunction(body);
    if (name === 'oklab') return parseOklabFunction(body);
    if (name === 'oklch') return parseOklchFunction(body);
    if (name === 'color') {
      const parts = cssComponents(body);
      if (parts.length >= 4 && parts[0] === 'srgb') {
        const values = parts.slice(1, 4).map((part) => clamp(Number.parseFloat(part), 0, 1) * 255);
        if (values.every(Number.isFinite)) return rgbToHex(values[0]!, values[1]!, values[2]!);
      }
    }
  }

  return parseBareHslTriplet(value);
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

const COLOR_TOKEN = /(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|color\([^)]*\))/gi;

export function collectColors(cssText: string, source: string, sink: Map<string, { count: number; sources: Set<string> }>): void {
  const cleaned = cssText.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const add = (hex: string, weight = 1, evidenceSource = source) => {
    const entry = sink.get(hex) ?? { count: 0, sources: new Set<string>() };
    entry.count += weight;
    entry.sources.add(evidenceSource);
    sink.set(hex, entry);
  };

  // Keep broad frequency evidence as a fallback for unusual frameworks, but
  // rank semantic variables and actual brand controls above incidental colors.
  for (const match of cleaned.matchAll(COLOR_TOKEN)) {
    const hex = parseCssColor(match[0]);
    if (hex) add(hex);
  }

  // Design systems use many variable naming conventions (e.g. --theme-primary,
  // --brand-primary, --color-accent, --action-color). Do not require one exact
  // token order before recognizing intentional palette variables.
  const variableDecl = /--([a-z0-9_-]+)\s*:\s*([^;}]+)/gi;
  for (const match of cleaned.matchAll(variableDecl)) {
    const name = (match[1] ?? '').toLowerCase();
    const semanticName =
      /(^|[-_])(brand|primary|secondary|accent|cta|link|action|highlight)([-_]|$)/i.test(name) ||
      /^theme-(primary|secondary|accent|brand|link|action)([-_]|$)/i.test(name);
    if (!semanticName) continue;
    const rawValue = (match[2] ?? '').trim();
    const hex = parseCssColor(rawValue) ?? parseBareHslTriplet(rawValue);
    if (hex) add(hex, 6, 'semantic-css');
  }

  // Selector-level evidence is shared by inline and external stylesheets.
  // Avoid boosting partner/customer logos and status/notification colours.
  const lowSignalSelector = /(partner|sponsor|testimonial|customer-logo|social-share|avatar|badge|alert|error|success|warning|status|tooltip|notification|toast|rating|review-star)/i;
  const rules = /([^{}]+)\{([^{}]*)\}/g;
  const colorProperty = /\b(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|fill|stroke)\s*:\s*([^;]+)(?:;|$)/gi;
  for (const rule of cleaned.matchAll(rules)) {
    const selector = (rule[1] ?? '').trim().toLowerCase();
    const declarations = rule[2] ?? '';
    if (!selector || selector.startsWith('@') || lowSignalSelector.test(selector)) continue;

    const headerSignal = /(^|[\s,>])(?:header|nav|banner|\.site-header|\.navbar|\.navigation|#header|#nav)(?=$|[\s,>:#.\[])/i.test(selector);
    const controlSignal = /(?:primary|brand|cta|accent|action|button|btn|(?:^|[\s,>])a(?:$|[\s,:>#.]))/i.test(selector);
    const weight = headerSignal ? 4 : controlSignal ? 3 : 0;
    if (!weight) continue;

    const signal = headerSignal ? 'header-ui' : /(?:^|[\s,>])a(?:$|[\s,:>#.])/i.test(selector) ? 'link-accent' : 'primary-control';
    for (const declaration of declarations.matchAll(colorProperty)) {
      for (const token of (declaration[1] ?? '').matchAll(COLOR_TOKEN)) {
        const hex = parseCssColor(token[0]);
        if (hex) add(hex, weight, signal);
      }
    }
  }
}
export function collectJavaScriptDesignTokens(
  scriptText: string,
  sink: Map<string, { count: number; sources: Set<string> }>,
): void {
  // Only accept colours located close to an explicit brand/theme/palette key.
  // This prevents arbitrary hex strings in analytics or user data from
  // polluting the palette while still supporting JS objects and CSS-in-JS.
  const source = scriptText
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .slice(0, 450_000);
  for (const match of source.matchAll(COLOR_TOKEN)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const before = source.slice(Math.max(0, index - 180), index);
    const tail = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n'), before.lastIndexOf('{')));
    const semanticKey = /(?:--[\w$-]*(?:brand|primary|secondary|accent|cta|action|link|color|colour|theme|palette)[\w$-]*|(?:brand|primary|secondary|accent|cta|action|link|highlight|palette|colou?rs?)[\w$-]*)(?:["'\`])?\s*[:=][^;]{0,150}$/i;
    const nearbyStyleProperty = /(?:background(?:Color)?|border(?:Color)?|fill|stroke|color|colou?r|theme|palette)\s*[:=][^;]{0,150}$/i;
    if (!semanticKey.test(tail) && !nearbyStyleProperty.test(tail)) continue;
    const hex = parseCssColor(raw);
    if (!hex) continue;
    const entry = sink.get(hex) ?? { count: 0, sources: new Set<string>() };
    entry.count += 5;
    entry.sources.add('js-style-tokens');
    sink.set(hex, entry);
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
    const semantic = sources.some((source) => source === 'semantic-css' || source === 'meta-theme-color' || source === 'manifest-theme-color');
    const uiSignal = sources.some((source) => source === 'header-ui' || source === 'nav-ui' || source === 'primary-control' || source === 'link-accent');
    const logoSignal = sources.includes('logo-svg-color');
    const rasterLogoSignal = sources.includes('logo-raster-color');
    const scriptStyleSignal = sources.includes('js-style-tokens');
    const neutralPenalty = isNeutral(hex) ? 0.18 : 1;
    const deliberateBoost = semantic ? 3.5 : uiSignal ? 2.5 : logoSignal ? 2.1 : rasterLogoSignal ? 1.9 : scriptStyleSignal ? 1.7 : 1;
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
  const candidates: Array<{ url: string; score: number; semanticLogo: boolean }> = [];
  let faviconUrl: string | null = null;
  let faviconScore = -1;

  const addCandidate = (url: string | null, score: number, semanticLogo = false) => {
    if (!url) return;
    // External CDNs are accepted only when the markup explicitly identifies
    // the asset as a logo; a homepage link or generic header image is not enough.
    if (!sameSiteUrl(base, url) && (!semanticLogo || score < 65)) return;
    candidates.push({ url, score, semanticLogo });
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

    const declaredSiteName = cleanMetaText($('meta[property="og:site_name"]').first().attr('content')) ?? cleanMetaText($('meta[name="application-name"]').first().attr('content')) ?? rootToken;
    const normalizedAlt = alt.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const normalizedSiteName = declaredSiteName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const genericLogoAlt = /^(?:company |brand )?(?:logo|wordmark|brandmark)$/i.test(normalizedAlt);
    const altMatchesSite = !normalizedAlt || genericLogoAlt || (normalizedSiteName.length > 2 && normalizedAlt.includes(normalizedSiteName)) || (rootToken.length > 2 && normalizedAlt.includes(rootToken));
    const semanticLogo = LOGO_HINT.test(path + ' ' + alt + ' ' + classes) && altMatchesSite && !/(stripe|paypal|visa|mastercard|partner|sponsor|customer|testimonial|case-study|twitter-card|og-image|social-share|hero|screenshot|thumbnail)/i.test(path + ' ' + alt + ' ' + classes + ' ' + parentText);
    addCandidate(url, score, semanticLogo);
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

  // Organization metadata may be a top-level object, an array, or nested in @graph.
  // Walk only structured objects and keep organization/logo evidence stronger than OG cards.
  const collectStructuredLogos = (value: unknown, depth = 0): void => {
    if (depth > 5 || value == null) return;
    if (Array.isArray(value)) {
      for (const entry of value) collectStructuredLogos(entry, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    const rawType = node['@type'];
    const type = Array.isArray(rawType) ? rawType.join(' ') : String(rawType ?? '');
    if (/(Organization|Corporation|Brand|WebSite)/i.test(type)) {
      const rawLogo = node.logo;
      const logo = typeof rawLogo === 'string'
        ? rawLogo
        : rawLogo && typeof rawLogo === 'object'
          ? String((rawLogo as Record<string, unknown>).url ?? (rawLogo as Record<string, unknown>).contentUrl ?? '')
          : '';
      addCandidate(absoluteUrl(logo, base), 80, true);
    }
    if (node['@graph']) collectStructuredLogos(node['@graph'], depth + 1);
    if (node.mainEntity) collectStructuredLogos(node.mainEntity, depth + 1);
  };
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      collectStructuredLogos(JSON.parse($(el).text()));
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
  // Don't use a social-preview OG image as the brand logo when a linked
  // favicon/app icon is available. The icon is a useful, honest fallback.
  const semanticLogo = candidates.find((candidate) => candidate.semanticLogo && candidate.score >= 20)?.url ?? null;
  return { logo: semanticLogo ?? faviconUrl, favicon: faviconUrl };
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

function detectStructuredBrandName($: cheerio.CheerioAPI): string | null {
  let found: string | null = null;
  const visit = (value: unknown, depth = 0): void => {
    if (found || depth > 6 || value == null) return;
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return; }
    if (typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    const rawType = node['@type'];
    const type = Array.isArray(rawType) ? rawType.join(' ') : String(rawType ?? '');
    if (/(Organization|Corporation|Brand|WebSite)/i.test(type) && typeof node.name === 'string') {
      const name = cleanMetaText(node.name);
      if (name) { found = name; return; }
    }
    for (const key of ['@graph', 'mainEntity', 'publisher', 'author']) visit(node[key], depth + 1);
  };
  $('script[type="application/ld+json"]').each((_i, el) => {
    if (found) return;
    try { visit(JSON.parse($(el).text())); } catch { /* Ignore malformed structured data. */ }
  });
  return found;
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
  else warnings.push('No embedded stylesheet found; linked stylesheets and declared theme colours are checked separately.');

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

  const themeColorHex = parseCssColor($('meta[name="theme-color"]').first().attr('content'));
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
    detectStructuredBrandName($) ??
    // og:title often names a product/campaign rather than the organization.
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