import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { requireOrgRole, CAN_VIEW_DASHBOARD } from '@/lib/auth/roles';
import { env } from '@/lib/env';
import { assertPublicHttpUrl, assertResolvablePublicHost, fetchPublicHttp, readBoundedBody } from '@/lib/research/url-security';
import { collectColors, collectJavaScriptDesignTokens, extractBrandIdentity, parseCssColor, rankPalette, shouldUseRenderedWebsiteFallback, type ExtractedColor, type ExtractedIdentity } from '@/lib/brand/visual-extraction';
import { extractRasterPalette, type RasterColorSample } from '@/lib/brand/raster-color-extraction';
import { createDefaultRegistry, runWithProviderFailover } from '@/lib/ai/registry';
import { buildEvidenceContext, extractBrandIntelligence, type EvidenceFragment } from '@/lib/ai/brand-intelligence';

export const maxDuration = 45;

function sameSite(a: string, b: string): boolean {
  const host = (value: string) => new URL(value).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const hostA = host(a);
  const hostB = host(b);
  return hostA === hostB || hostA.endsWith('.' + hostB) || hostB.endsWith('.' + hostA);
}

type FetchOutcome =
  | { ok: true; html: string; finalUrl: string; renderedFallback?: boolean }
  | { ok: false; reason: string; finalUrl: string | null };

async function fetchHtml(root: URL, maxRedirects = 3, userAgent = env().RESEARCH_USER_AGENT, allowReaderFallback = true): Promise<FetchOutcome> {
  let target = root.toString();
  let finalUrl: string | null = null;

  for (let redirects = 0; redirects <= Math.min(env().MAX_RESEARCH_REDIRECTS, maxRedirects); redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(env().RESEARCH_TIMEOUT_MS, 7000));
    try {
      const response = await fetchPublicHttp(target, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml',
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location || redirects >= maxRedirects) break;
        const next = assertPublicHttpUrl(new URL(location, target).toString());
        if (!sameSite(root.toString(), next.toString())) break;
        await assertResolvablePublicHost(next.hostname);
        target = next.toString();
        finalUrl = target;
        continue;
      }

      if (!response.ok) {
        // Public sites can reject the server-side fetch while remaining readable
        // through a browser-backed reader. Give that reader one bounded chance
        // before reporting the site as unavailable.
        if (allowReaderFallback && [401, 403, 407, 408, 429, 451, 500, 502, 503, 504].includes(response.status)) {
          const rendered = await fetchRenderedResearch(target);
          if (rendered) {
            return { ok: true, html: `<html><head><title>${(rendered.title ?? '').replace(/[<>]/g, '')}</title><meta name="description" content="${(rendered.title ?? '').replace(/["<>]/g, '')}"/></head><body><main><p>${rendered.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p></main></body></html>`, finalUrl: target, renderedFallback: true };
          }
        }
        return { ok: false, reason: `The website responded with HTTP ${response.status}.`, finalUrl: target };
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('html') && !contentType.includes('xhtml')) {
        return { ok: false, reason: 'That URL did not return an HTML page.', finalUrl: target };
      }
      const bounded = await readBoundedBody(response, Math.min(env().MAX_RESEARCH_BYTES, 900_000));
      return { ok: true, html: bounded.content, finalUrl: target };
    } catch {
      const rendered = allowReaderFallback ? await fetchRenderedResearch(target) : null;
      if (rendered) {
        return {
          ok: true,
          html: `<html><head><title>${(rendered.title ?? '').replace(/[<>]/g, '')}</title><meta name="description" content="${(rendered.title ?? '').replace(/["<>]/g, '')}"/></head><body><main><p>${rendered.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p></main></body></html>`,
          finalUrl: target,
          renderedFallback: true,
        };
      }
      return { ok: false, reason: 'The website could not be reached.', finalUrl: finalUrl ?? target };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, reason: 'The website could not be reached.', finalUrl };
}

async function readBoundedBytes(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function externalScriptUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  const add = (raw: string | undefined) => {
    const href = absoluteUrl(raw, baseUrl);
    if (!href) return;
    try {
      urls.add(assertPublicHttpUrl(href).toString());
    } catch {
      // Keep unsafe schemes, credentials, and unusual ports out of extraction.
    }
  };
  $('script[src]').each((_i, el) => add($(el).attr('src')));
  $('link[href][rel]').each((_i, el) => {
    const rel = ($(el).attr('rel') ?? '').toLowerCase().split(/\s+/);
    const as = ($(el).attr('as') ?? '').toLowerCase();
    if (rel.includes('modulepreload') || (rel.includes('preload') && as === 'script')) add($(el).attr('href'));
  });
  return [...urls].slice(0, 4);
}

async function fetchScriptText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const safe = assertPublicHttpUrl(url);
    await assertResolvablePublicHost(safe.hostname);
    const response = await fetchPublicHttp(safe.toString(), {
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'user-agent': env().RESEARCH_USER_AGENT, accept: 'text/javascript,application/javascript,application/ecmascript,*/*;q=0.1' },
    });
    if (!response.ok) return null;
    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!/(?:javascript|ecmascript|text\/plain)/i.test(type) && !/\.(?:m?js)(?:[?#]|$)/i.test(safe.toString())) return null;
    const bounded = await readBoundedBody(response, 280_000);
    return bounded.content.slice(0, 280_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function inlineScriptBlocks(html: string): string[] {
  const $ = cheerio.load(html);
  const scripts: string[] = [];
  $('script:not([src])').each((_i, el) => {
    const type = ($(el).attr('type') ?? '').toLowerCase();
    if (type.includes('json')) return;
    const text = $(el).text().trim();
    if (text.length > 24) scripts.push(text.slice(0, 70_000));
  });
  return scripts.slice(0, 3);
}

function rasterLogoUrls(html: string, baseUrl: string, knownUrls: Array<string | null | undefined>): string[] {
  const $ = cheerio.load(html);
  const found = new Set<string>();
  const add = (raw: string | undefined | null) => {
    const url = absoluteUrl(raw ?? undefined, baseUrl);
    if (!url) return;
    try { found.add(assertPublicHttpUrl(url).toString()); } catch { /* Unsafe visual URL. */ }
  };
  for (const url of knownUrls) add(url ?? undefined);
  $('link[rel][href]').each((_i, el) => {
    const rel = ($(el).attr('rel') ?? '').toLowerCase();
    if (/(?:icon|apple-touch-icon|mask-icon|manifest)/i.test(rel)) add($(el).attr('href'));
  });
  $('img, picture img, picture source').each((_i, el) => {
    const node = $(el);
    const hints = [node.attr('src'), node.attr('data-src'), node.attr('data-lazy-src'), node.attr('alt'), node.attr('class'), node.attr('id')].filter(Boolean).join(' ');
    if (/(logo|wordmark|brandmark|brand-logo|favicon|brand-icon)/i.test(hints)) {
      add(node.attr('src') ?? node.attr('data-src') ?? node.attr('data-lazy-src') ?? node.attr('srcset')?.split(',')[0]?.trim().split(' ')[0]);
    }
  });
  // Common icon conventions are additional candidates, not assumed to exist.
  for (const path of ['/favicon.png', '/favicon-32x32.png', '/apple-touch-icon.png']) add(path);
  return [...found].slice(0, 5);
}

async function fetchRasterColors(url: string): Promise<RasterColorSample[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const safe = assertPublicHttpUrl(url);
    await assertResolvablePublicHost(safe.hostname);
    const response = await fetchPublicHttp(safe.toString(), {
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'user-agent': env().RESEARCH_USER_AGENT, accept: 'image/png,image/x-icon,image/vnd.microsoft.icon,image/*;q=0.5,*/*;q=0.1' },
    });
    if (!response.ok) return [];
    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    if (type.includes('text/html') || type.includes('application/json') || type.includes('javascript')) return [];
    const bytes = await readBoundedBytes(response, 420_000);
    return bytes ? extractRasterPalette(bytes, 12) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCss(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const safe = assertPublicHttpUrl(url);
    await assertResolvablePublicHost(safe.hostname);
    const response = await fetchPublicHttp(safe.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': env().RESEARCH_USER_AGENT, accept: 'text/css,*/*;q=0.1' },
    });
    if (!response.ok) return '';
    const type = (response.headers.get('content-type') || '').toLowerCase();
    if (type.includes('text/html') || type.includes('application/json') || type.includes('javascript') || type.startsWith('image/')) return '';
    const bounded = await readBoundedBody(response, 350_000);
    const content = bounded.content;
    // Some hosts serve declared stylesheets as text/plain or omit content-type
    // on hashed CSS routes. Validate the response body instead of discarding it.
    const looksLikeCss = /(?:--[\w-]+\s*:|(?:^|[;{\s])(?:color|background(?:-color)?|font-family|@import)\s*:?)|[^{}]+\{[^{}]*\}/i.test(content);
    if (!type.includes('css') && !/\.css(?:[?#]|$)/i.test(url) && !looksLikeCss) return '';
    return content;
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}


async function verifyConventionalIcon(baseUrl: string): Promise<string | null> {
  const candidates = ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png'];
  const results = await Promise.all(candidates.map(async (path) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const candidate = assertPublicHttpUrl(new URL(path, baseUrl).toString());
      await assertResolvablePublicHost(candidate.hostname);
      const response = await fetchPublicHttp(candidate.toString(), {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'user-agent': env().RESEARCH_USER_AGENT, accept: 'image/*' },
      });
      if (!response.ok) return null;
      const type = (response.headers.get('content-type') ?? '').toLowerCase();
      if (type.startsWith('image/')) return candidate.toString();
      if (path.endsWith('.ico') && !type.includes('text/html') && !type.includes('application/json')) return candidate.toString();
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }));
  return results.find((url): url is string => Boolean(url)) ?? null;
}
function absoluteUrl(value: string | undefined, base: string): string | null {
  if (!value || value.startsWith('data:') || value.startsWith('javascript:')) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchRenderedResearch(url: string): Promise<{ title: string | null; text: string } | null> {
  const key = env().JINA_API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(env().RESEARCH_TIMEOUT_MS * 2, 20_000));
  try {
    const response = await fetch('https://r.jina.ai/' + url, {
      signal: controller.signal,
      headers: {
        accept: 'text/plain',
        ...(key ? { authorization: 'Bearer ' + key } : {}),
      },
    });
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    if (text.length < 180) return null;
    const title = text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('# '))
      ?.slice(2)
      .trim() || null;
    return { title, text: text.slice(0, 50_000) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function renderedResearchLinks(text: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    try {
      const candidate = assertPublicHttpUrl(new URL(raw, baseUrl).toString());
      if (!sameSite(baseUrl, candidate.toString())) return;
      candidate.hash = '';
      if (/\.(?:png|jpe?g|gif|svg|webp|pdf|zip|xml|css|js|mp4|webm)$/i.test(candidate.pathname)) return;
      found.add(candidate.toString());
    } catch {
      // Reader links are untrusted input; invalid/private/non-HTTP URLs are ignored.
    }
  };
  for (const match of text.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)) {
    if (match[1]) add(match[1]);
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/g)) {
    if (match[0]) add(match[0].replace(/[.,;:!?]+$/, ''));
  }
  return [...found].slice(0, 8);
}
function pageText(html: string): { title: string | null; text: string } {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg').remove();
  const title = $('title').first().text().replace(/\s+/g, ' ').trim() || null;
  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 16_000);
  return { title, text };
}

function prioritizedLinks(html: string, rootUrl: string): string[] {
  const $ = cheerio.load(html);
  const root = new URL(rootUrl);
  const rootHost = root.hostname.replace(/^www\\./, '');
  const scored = new Map<string, number>();
  const highSignal = [
    ['mission', 18], ['science', 18], ['research', 17], ['technology', 16], ['program', 15],
    ['product', 15], ['service', 15], ['solution', 14], ['about', 14], ['company', 12],
    ['audience', 11], ['customer', 11], ['industry', 10], ['education', 10], ['learning', 10],
    ['offer', 9], ['pricing', 8], ['feature', 8], ['use-case', 8], ['who-we-are', 8],
    ['team', 7], ['contact', 2], ['work', 4], ['portfolio', 4],
  ] as const;
  const lowSignal = [
    'news', 'press', 'blog', 'podcast', 'event', 'media', 'social', 'newsletter',
  ] as const;

  $('a[href]').each((_i, el) => {
    const href = absoluteUrl($(el).attr('href'), rootUrl);
    if (!href) return;
    let parsed: URL;
    try { parsed = new URL(href); } catch { return; }
    if (parsed.hostname.replace(/^www\\./, '') !== rootHost) return;
    if (parsed.hash) return;

    const pathText = parsed.pathname + ' ' + ($(el).text() || '');
    const normalized = pathText.toLowerCase();
    let score = parsed.pathname === '/' || parsed.pathname === '' ? 4 : 0;

    for (const [keyword, weight] of highSignal) {
      if (normalized.includes(keyword)) score += weight;
    }
    for (const keyword of lowSignal) {
      if (normalized.includes(keyword)) score -= 10;
    }

    if (score > 0) {
      scored.set(parsed.toString(), Math.max(score, scored.get(parsed.toString()) ?? 0));
    }
  });

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([url]) => url);
}

function externalStylesheetUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  const add = (raw: string | undefined) => {
    const href = absoluteUrl(raw, baseUrl);
    if (!href) return;
    try {
      // A public website may host its CSS on a CDN that is not a subdomain of
      // the site's apex. Fetch only resources explicitly declared as CSS and
      // let URL/DNS checks in fetchCss reject private or unsafe destinations.
      const parsed = assertPublicHttpUrl(href);
      urls.add(parsed.toString());
    } catch {
      // Invalid schemes, credentials and non-standard ports are rejected.
    }
  };
  $('link[href]').each((_i, el) => {
    const node = $(el);
    const rel = (node.attr('rel') ?? '').toLowerCase().split(/\s+/);
    const as = (node.attr('as') ?? '').toLowerCase();
    const href = node.attr('href') ?? '';
    if (rel.includes('stylesheet') || (rel.includes('preload') && as === 'style') || /\.css(?:[?#]|$)/i.test(href)) add(href);
  });
  $('style').each((_i, el) => {
    const css = $(el).text();
    for (const match of css.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/gi)) {
      if (match[1]) add(match[1]);
    }
  });
  return [...urls].slice(0, 12);
}

function mergeExternalCss(
  identity: ExtractedIdentity,
  cssBlocks: string[],
  assetBlocks: string[] = [],
  manifestColors: string[] = [],
  rasterColors: RasterColorSample[] = [],
  scriptBlocks: string[] = [],
): ExtractedIdentity {
  if (cssBlocks.length === 0 && assetBlocks.length === 0 && manifestColors.length === 0 && rasterColors.length === 0 && scriptBlocks.length === 0) return identity;
  const sink = new Map<string, { count: number; sources: Set<string> }>();
  const fonts = new Map(identity.fonts.map((font) => [font.family.toLowerCase(), font]));
  for (const css of cssBlocks) {
    collectColors(css, 'external-stylesheet', sink);
    const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const match of cleaned.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
      const family = (match[1] ?? '').split(',')[0].replace(/["']/g, '').trim();
      if (family.length >= 2 && family.length <= 60 && !/^(inherit|initial|unset|sans-serif|serif|monospace)$/i.test(family)) {
        const key = family.toLowerCase();
        if (!fonts.has(key)) fonts.set(key, { family, source: 'css-declaration', evidence: match[0].slice(0, 100) });
      }
    }
  }
  for (const asset of assetBlocks) collectColors(asset, 'logo-svg-color', sink);
  for (const script of scriptBlocks) collectJavaScriptDesignTokens(script, sink);
  for (const sample of rasterColors) {
    const entry = sink.get(sample.hex) ?? { count: 0, sources: new Set<string>() };
    entry.count += Math.min(sample.count, 500);
    entry.sources.add('logo-raster-color');
    sink.set(sample.hex, entry);
  }
  for (const rawColor of manifestColors) {
    const hex = parseCssColor(rawColor);
    if (!hex) continue;
    const entry = sink.get(hex) ?? { count: 0, sources: new Set<string>() };
    entry.count += 10;
    entry.sources.add('manifest-theme-color');
    sink.set(hex, entry);
  }

  const externalPalette = rankPalette(sink, 8);
  const paletteMap = new Map(identity.palette.map((color) => [color.hex, color]));
  for (const color of externalPalette) {
    const previous = paletteMap.get(color.hex);
    paletteMap.set(color.hex, previous ? {
      ...color,
      occurrences: previous.occurrences + color.occurrences,
      sources: [...new Set([...previous.sources, ...color.sources])],
    } : color);
  }
  const mergedPalette = rankPalette(
    new Map([...paletteMap.entries()].map(([hex, color]) => [hex, { count: color.occurrences, sources: new Set(color.sources) }])) ,
    10,
  );
  const chromatic = mergedPalette.filter((c) => c.role !== 'neutral');

  return {
    ...identity,
    palette: mergedPalette,
    primaryColor: chromatic[0]?.hex ?? identity.primaryColor,
    secondaryColors: chromatic.slice(1, 5).map((c) => c.hex),
    accentColors: chromatic.slice(5, 9).map((c) => c.hex),
    fonts: [...fonts.values()].slice(0, 10),
    inspected: [
      ...identity.inspected,
      ...(cssBlocks.length ? [`${cssBlocks.length} external stylesheet(s)`] : []),
      ...(assetBlocks.length ? [`${assetBlocks.length} SVG visual asset(s)`] : []),
      ...(manifestColors.length ? ['web-app manifest theme colour'] : []),
      ...(rasterColors.length ? [String(rasterColors.length) + ' logo/favicon raster colour sample(s)'] : []),
      ...(scriptBlocks.length ? [String(scriptBlocks.length) + ' inline/script bundle(s) inspected for design tokens'] : []),
      ...([...sink.values()].some((entry) => entry.sources.has('js-style-tokens')) ? ['JavaScript/CSS-in-JS design tokens'] : []),
    ],
    warnings: identity.warnings.filter((warning) =>
      !((cssBlocks.length > 0 || assetBlocks.length > 0 || manifestColors.length > 0 || rasterColors.length > 0 || scriptBlocks.length > 0) &&
        (warning.includes('inline stylesheet') || warning.includes('embedded stylesheet'))) &&
      !((cssBlocks.length > 0 || assetBlocks.length > 0 || manifestColors.length > 0 || rasterColors.length > 0 || scriptBlocks.length > 0) &&
        mergedPalette.some((color) => color.role !== 'neutral') &&
        warning.includes('No usable colour declarations')),
    ),
  };
}

async function fetchCssTree(url: string, depth = 0, seen = new Set<string>()): Promise<string[]> {
  let normalized: string;
  try {
    normalized = assertPublicHttpUrl(url).toString();
  } catch {
    return [];
  }
  if (seen.has(normalized)) return [];
  seen.add(normalized);
  const css = await fetchCss(normalized);
  if (!css) return [];
  if (depth >= 2) return [css];

  const imported = new Set<string>();
  for (const match of css.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/gi)) {
    try {
      imported.add(assertPublicHttpUrl(new URL(match[1]!, normalized).toString()).toString());
    } catch {
      // Ignore invalid or unsafe nested imports.
    }
  }
  const children = await Promise.all([...imported].slice(0, 4).map((child) => fetchCssTree(child, depth + 1, seen)));
  return [css, ...children.flat()];
}

async function fetchSvgAsset(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const safe = assertPublicHttpUrl(url);
    await assertResolvablePublicHost(safe.hostname);
    const response = await fetchPublicHttp(safe.toString(), {
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'user-agent': env().RESEARCH_USER_AGENT, accept: 'image/svg+xml,text/plain;q=0.8,*/*;q=0.2' },
    });
    if (!response.ok) return null;
    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!type.includes('svg') && !/\.svg(?:[?#]|$)/i.test(safe.toString())) return null;
    const body = await readBoundedBody(response, 180_000);
    return /<svg[\s>]/i.test(body.content) ? body.content : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchManifestVisuals(html: string, baseUrl: string): Promise<{ colors: string[]; icons: string[] }> {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('link[rel~="manifest"][href]').each((_i, el) => {
    const href = absoluteUrl($(el).attr('href'), baseUrl);
    if (href) urls.add(href);
  });
  for (const url of [...urls].slice(0, 2)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const safe = assertPublicHttpUrl(url);
      await assertResolvablePublicHost(safe.hostname);
      const response = await fetchPublicHttp(safe.toString(), {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'user-agent': env().RESEARCH_USER_AGENT, accept: 'application/manifest+json,application/json,*/*;q=0.2' },
      });
      if (!response.ok) continue;
      const bounded = await readBoundedBody(response, 100_000);
      const manifest = JSON.parse(bounded.content) as {
        theme_color?: unknown;
        background_color?: unknown;
        icons?: Array<{ src?: unknown; sizes?: unknown }>;
      };
      const colors = [manifest.theme_color, manifest.background_color]
        .filter((value): value is string => typeof value === 'string' && Boolean(parseCssColor(value)));
      const icons = (Array.isArray(manifest.icons) ? manifest.icons : [])
        .filter((icon) => typeof icon.src === 'string')
        .sort((a, b) => Number(String(b.sizes ?? '').split('x')[0]) - Number(String(a.sizes ?? '').split('x')[0]))
        .slice(0, 4)
        .map((icon) => absoluteUrl(String(icon.src), safe.toString()))
        .filter((value): value is string => Boolean(value));
      return { colors, icons };
    } catch {
      // A malformed or blocked manifest must not invalidate the website scan.
    } finally {
      clearTimeout(timeout);
    }
  }
  return { colors: [], icons: [] };
}

function mergeVisualIdentity(identity: ExtractedIdentity, visual: ExtractedIdentity): ExtractedIdentity {
  const palette = new Map<string, { count: number; sources: Set<string> }>();
  for (const item of [...identity.palette, ...visual.palette]) {
    const entry = palette.get(item.hex) ?? { count: 0, sources: new Set<string>() };
    entry.count += item.occurrences;
    for (const source of item.sources) entry.sources.add(source);
    palette.set(item.hex, entry);
  }
  const ranked = rankPalette(palette, 10);
  const chromatic = ranked.filter((item) => item.role !== 'neutral');
  const fonts = new Map<string, ExtractedIdentity['fonts'][number]>();
  for (const font of [...identity.fonts, ...visual.fonts]) {
    if (!fonts.has(font.family.toLowerCase())) fonts.set(font.family.toLowerCase(), font);
  }
  return {
    ...identity,
    logoUrl: visual.logoUrl ?? identity.logoUrl,
    faviconUrl: visual.faviconUrl ?? identity.faviconUrl,
    palette: ranked,
    primaryColor: chromatic[0]?.hex ?? identity.primaryColor ?? visual.primaryColor,
    secondaryColors: chromatic.slice(1, 5).map((item) => item.hex),
    accentColors: chromatic.slice(5, 9).map((item) => item.hex),
    fonts: [...fonts.values()].slice(0, 10),
    inspected: [...new Set([...identity.inspected, ...visual.inspected])],
    warnings: [...new Set([...identity.warnings, ...visual.warnings])],
  };
}

function buildAiProfile(intelligence: Awaited<ReturnType<typeof extractBrandIntelligence>>['result']) {
  const combinedOfferings = intelligence.offer.productsAndServices.slice(0, 20);
  return {
    // Keep offerings distinct. The previous mapping duplicated every combined
    // offering into both UI fields, creating false product/service classifications.
    products: (intelligence.offer.products.length ? intelligence.offer.products : combinedOfferings).slice(0, 20),
    services: intelligence.offer.services.slice(0, 20),
    keyFeatures: intelligence.offer.keyFeatures.slice(0, 16),
    benefits: intelligence.offer.benefits.slice(0, 16),
    pricingSignals: intelligence.offer.pricingSignals.slice(0, 12),
    audience: intelligence.audience.targetAudience,
    personas: intelligence.audience.buyerPersonas.slice(0, 8),
    customerTypes: intelligence.audience.customerTypes.slice(0, 12),
    painPoints: intelligence.audience.painPoints.slice(0, 12),
    useCases: intelligence.audience.useCases.slice(0, 12),
    tone: intelligence.messaging.toneOfVoice.slice(0, 6),
    terminology: intelligence.messaging.terminology.slice(0, 20),
    recurringClaims: intelligence.messaging.recurringClaims.slice(0, 12),
    messagingThemes: intelligence.messaging.messagingThemes.slice(0, 12),
    valueProposition: intelligence.positioning.valueProposition,
    differentiators: intelligence.positioning.differentiators.slice(0, 12),
    positioningThemes: intelligence.positioning.positioningThemes.slice(0, 12),
    callsToAction: intelligence.offer.callsToAction.slice(0, 12),
    productCategories: intelligence.identity.productCategories.slice(0, 12),
    industry: intelligence.identity.industry,
    businessModel: intelligence.identity.businessModel,
    primaryMarket: intelligence.identity.primaryMarket,
    geography: intelligence.identity.geography,
    seo: {
      importantTopics: intelligence.seo.importantTopics.slice(0, 12),
      keywordThemes: intelligence.seo.keywordThemes.slice(0, 12),
      contentGaps: intelligence.seo.contentGaps.slice(0, 12),
      searchIntentOpportunities: intelligence.seo.searchIntentOpportunities.slice(0, 12),
    },
    competition: {
      namedCompetitors: intelligence.competition.namedCompetitors.slice(0, 12),
      alternatives: intelligence.competition.alternatives.slice(0, 12),
      differentiationClaims: intelligence.competition.differentiationClaims.slice(0, 12),
    },
    evidence: intelligence.evidence.slice(0, 20),
  };
}

/**
 * Website-first Brand IQ extraction.
 *
 * The first page supplies the visual identity. A bounded same-domain crawl
 * supplies products/services/audience/messaging evidence. External stylesheets
 * are fetched too, which is essential for modern sites whose colours and fonts
 * are not present in inline HTML.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const raw = new URL(request.url).searchParams.get('url')?.trim();
    if (!raw) return NextResponse.json({ error: 'Website URL is required.' }, { status: 400 });

    const root = assertPublicHttpUrl(raw);
    await assertResolvablePublicHost(root.hostname);

    const outcome = await fetchHtml(root);
    let renderedFallbackText: string | null = null;
    let renderedFallbackTitle: string | null = null;

    if (outcome.ok && outcome.renderedFallback) {
      const fallbackPage = pageText(outcome.html);
      renderedFallbackText = fallbackPage.text;
      renderedFallbackTitle = fallbackPage.title;
    } else if (outcome.ok && shouldUseRenderedWebsiteFallback(outcome.html)) {
      // HTTP 200 does not mean that useful website content was returned. Many
      // React/Next/static-hosting sites return only an application shell to a
      // server fetch, so attempt one bounded rendered read before building an
      // empty Brand IQ review.
      const directPage = pageText(outcome.html);
      const rendered = await fetchRenderedResearch(outcome.finalUrl);
      if (rendered && rendered.text.length >= 180 && rendered.text.length > directPage.text.length + 100) {
        renderedFallbackText = rendered.text;
        renderedFallbackTitle = rendered.title ?? directPage.title;
      }
    } else if (!outcome.ok) {
      const rendered = await fetchRenderedResearch(outcome.finalUrl ?? root.toString());
      if (!rendered) {
        return NextResponse.json(
          { error: outcome.reason + ' The rendered reader could not recover meaningful public content from this URL.', identity: null },
          { status: 422, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      renderedFallbackText = rendered.text;
      renderedFallbackTitle = rendered.title;
    }

    let identity = outcome.ok
      ? extractBrandIdentity(outcome.html, outcome.finalUrl)
      : extractBrandIdentity(
          '<html><head>' +
            (renderedFallbackTitle ? '<title>' + renderedFallbackTitle.replace(/[<>]/g, '') + '</title>' : '') +
            '</head><body><p>' +
            renderedFallbackText!.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
            '</p></body></html>',
          raw,
        );
    let baseHtml = outcome.ok && !outcome.renderedFallback ? outcome.html : '';
    let baseUrl = outcome.ok ? outcome.finalUrl : raw;
    let stylesheetUrls = baseHtml ? externalStylesheetUrls(baseHtml, baseUrl) : [];

    // If the scraper user-agent received a rendered-reader fallback or HTML
    // without discoverable CSS, retry the public page once with a normal browser
    // user-agent. This does not bypass URL/DNS safety and never runs unbounded.
    if (!baseHtml || stylesheetUrls.length === 0) {
      const browserPage = await fetchHtml(
        root,
        3,
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        false,
      );
      if (browserPage.ok && !browserPage.renderedFallback) {
        const browserStyles = externalStylesheetUrls(browserPage.html, browserPage.finalUrl);
        if (!baseHtml || browserStyles.length > stylesheetUrls.length || browserPage.html.length > baseHtml.length + 250) {
          baseHtml = browserPage.html;
          baseUrl = browserPage.finalUrl;
          identity = mergeVisualIdentity(identity, extractBrandIdentity(browserPage.html, browserPage.finalUrl));
        }
        stylesheetUrls = [...new Set([...stylesheetUrls, ...browserStyles])].slice(0, 12);
      }
    }

    // Some sites publish only an app manifest, or an SVG logo contains the
    // brand palette when the HTML has no authored CSS.
    const manifestVisuals = baseHtml
      ? await fetchManifestVisuals(baseHtml, baseUrl)
      : { colors: [], icons: [] };
    if (!identity.logoUrl && manifestVisuals.icons[0]) identity.logoUrl = manifestVisuals.icons[0];
    if (!identity.faviconUrl && manifestVisuals.icons[0]) identity.faviconUrl = manifestVisuals.icons[0];

    // Verify conventional icon paths if neither HTML nor the manifest exposes
    // one. The fallback is based on a successful public response, never a guess.
    if (!identity.logoUrl || !identity.faviconUrl) {
      const conventionalIcon = await verifyConventionalIcon(baseUrl);
      if (conventionalIcon) {
        identity.logoUrl = identity.logoUrl ?? conventionalIcon;
        identity.faviconUrl = identity.faviconUrl ?? conventionalIcon;
        if (!identity.inspected.includes('verified conventional favicon fallback')) {
          identity.inspected.push('verified conventional favicon fallback');
        }
      }
    }

    const cssBlocks = (await Promise.all(stylesheetUrls.map((url) => fetchCssTree(url)))).flat();
    const svgUrls = [...new Set([identity.logoUrl, identity.faviconUrl, ...manifestVisuals.icons])]
      .filter((url): url is string => {
        if (typeof url !== 'string') return false;
        return /\.svg(?:[?#]|$)/i.test(url);
      })
      .slice(0, 3);
    const svgBlocks = (await Promise.all(svgUrls.map(fetchSvgAsset))).filter((asset): asset is string => Boolean(asset));

    // Modern frameworks frequently keep theme colours in JS/CSS-in-JS bundles
    // instead of HTML or standalone CSS. Read only explicitly declared public
    // scripts, with strict time and byte caps.
    const inlineScripts = inlineScriptBlocks(baseHtml);
    const externalScripts = (await Promise.all(externalScriptUrls(baseHtml, baseUrl).map(fetchScriptText)))
      .filter((script): script is string => Boolean(script));
    const scriptBlocks = [...inlineScripts, ...externalScripts];
    const rasterUrls = rasterLogoUrls(baseHtml, baseUrl, [identity.logoUrl, identity.faviconUrl, ...manifestVisuals.icons]);
    const rasterColors = (await Promise.all(rasterUrls.map(fetchRasterColors))).flat();

    identity = mergeExternalCss(identity, cssBlocks, svgBlocks, manifestVisuals.colors, rasterColors, scriptBlocks);

    const directLinks = baseHtml ? prioritizedLinks(baseHtml, baseUrl) : [];
    const readerLinks = renderedFallbackText ? renderedResearchLinks(renderedFallbackText, baseUrl) : [];
    const pageCandidates = [...new Set([...directLinks, ...readerLinks])]
      .filter((url) => sameSite(baseUrl, url))
      .slice(0, 7);
    const pageUrls = [baseUrl, ...pageCandidates];
    const evidencePages: Array<{ url: string; title: string | null; text: string }> = [];

    const directHomepage = outcome.ok ? pageText(outcome.html) : null;
    const usedRenderedFallback = outcome.ok === true && outcome.renderedFallback === true;
    const homepage = renderedFallbackText && (!directHomepage || usedRenderedFallback || renderedFallbackText.length > directHomepage.text.length)
      ? { title: renderedFallbackTitle ?? directHomepage?.title ?? null, text: renderedFallbackText }
      : directHomepage ?? { title: renderedFallbackTitle, text: renderedFallbackText ?? '' };
    evidencePages.push({ url: baseUrl, ...homepage });

    const extraPages = await Promise.all(pageCandidates.map(async (url, index) => {
      const page = await fetchHtml(new URL(url), 1);
      if (page.ok === false) return null;
      const direct = pageText(page.html);
      if (page.ok === true && page.renderedFallback) return { url: page.finalUrl, ...direct };

      // Keep this fallback bounded across child pages so a shell-heavy site
      // can contribute real evidence without turning one scan into an
      // unbounded set of third-party rendering requests.
      if (index < 3 && shouldUseRenderedWebsiteFallback(page.html)) {
        const rendered = await fetchRenderedResearch(page.finalUrl);
        if (rendered && rendered.text.length > direct.text.length + 100) {
          return { url: page.finalUrl, title: rendered.title ?? direct.title, text: rendered.text };
        }
      }
      return { url: page.finalUrl, ...direct };
    }));
    for (const page of extraPages) if (page?.text?.trim()) evidencePages.push(page);

    const accessibleTextChars = evidencePages.reduce((total, page) => total + page.text.trim().length, 0);
    const hasVisualEvidence = Boolean(identity.brandName || identity.description || identity.logoUrl || identity.faviconUrl || identity.palette.length);
    if (accessibleTextChars < 180 && !hasVisualEvidence) {
      return NextResponse.json(
        {
          error: 'The URL responded, but no meaningful public content could be extracted. The site may require client-side rendering, block automated readers, or only be available after sign-in. Try the canonical homepage URL or check that the page is public.',
          identity: null,
          diagnostics: { pageCount: evidencePages.length, accessibleTextChars, renderedReaderUsed: Boolean(renderedFallbackText) },
        },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const assets = (() => {
      if (!baseHtml) return [];
      const $ = cheerio.load(baseHtml);
      const found = new Map<string, { url: string; type: string; label: string | null }>();
      $('img[src],source[src],video[poster]').each((_i, el) => {
        const node = $(el);
        const candidate = node.attr('src') ?? node.attr('poster');
        const url = absoluteUrl(candidate, baseUrl);
        if (!url || !sameSite(baseUrl, url) || found.has(url)) return;
        found.set(url, { url, type: 'image', label: node.attr('alt') ?? null });
      });
      return [...found.values()].slice(0, 18);
    })();

    let aiProfile: Record<string, unknown> | null = null;
    const aiWarnings: string[] = [];
    try {
      const registry = createDefaultRegistry();
      const providers = registry.configuredInOrder();
      if (providers.length === 0) {
        aiWarnings.push('AI enrichment is unavailable because no configured AI provider was found.');
      } else {
        const fragments: EvidenceFragment[] = evidencePages
          .filter((page) => page.text.trim())
          .map((page) => ({ url: page.url, title: page.title, text: page.text, sourceType: 'first-party' as const }));
        const evidence = buildEvidenceContext(fragments);
        if (evidence.length > 0) {
          const extractionRun = await runWithProviderFailover(
            providers,
            (provider) => extractBrandIntelligence(provider, evidence),
            (failed, next) => {
              aiWarnings.push(`AI enrichment switched from ${failed.id} to ${next.id} after a transient provider limit or availability error.`);
            },
          );
          aiProfile = buildAiProfile(extractionRun.result.result);
          if (!identity.brandName && extractionRun.result.result.identity.brandName) identity.brandName = extractionRun.result.result.identity.brandName;
          if (!identity.description && extractionRun.result.result.identity.companyDescription) identity.description = extractionRun.result.result.identity.companyDescription;
        }
      }
    } catch (error) {
      aiWarnings.push(error instanceof Error ? `AI enrichment failed: ${error.message}` : 'AI enrichment failed.');
    }

    const warnings = [...new Set([...identity.warnings, ...aiWarnings])];
    const enriched = {
      ...identity,
      assets,
      aiProfile,
      crawl: {
        pages: pageUrls.slice(0, 6),
        pageCount: evidencePages.length,
        stylesheetCount: cssBlocks.length,
      },
      warnings,
      inspected: [...new Set([...identity.inspected, `${evidencePages.length} same-domain page(s)`, `${assets.length} image asset(s)`])],
    };

    return NextResponse.json(
      { ok: true, identity: enriched, detectedCount: enriched.palette.length, evidenceCount: evidencePages.length },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Could not inspect the website.';
    return NextResponse.json({ error: message, identity: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
