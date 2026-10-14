import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { requireOrgRole, CAN_VIEW_DASHBOARD } from '@/lib/auth/roles';
import { env } from '@/lib/env';
import { assertPublicHttpUrl, assertResolvablePublicHost, fetchPublicHttp, readBoundedBody } from '@/lib/research/url-security';
import { collectColors, collectJavaScriptDesignTokens, extractBrandIdentity, extractRenderedLogoCandidates, extractDeclaredFonts, rankExtractedFonts, parseCssColor, rankPalette, shouldUseRenderedWebsiteFallback, isBlockedWebsiteResponse, isRenderedReaderError, shouldRejectInsufficientWebsiteEvidence, type ExtractedColor, type ExtractedIdentity } from '@/lib/brand/visual-extraction';
import { extractRasterPalette, rasterColorEvidenceWeight, type RasterColorSample } from '@/lib/brand/raster-color-extraction';
import { createDefaultRegistry, runWithProviderFailover } from '@/lib/ai/registry';
import { AiProviderError } from '@/lib/ai/types';
import { BrandIntelligenceValidationError, buildEvidenceContext, extractBrandIntelligence, websiteEnrichmentModel, type EvidenceFragment } from '@/lib/ai/brand-intelligence';
import { brandNameFromWebsiteUrl, normalizeWebsiteHostname } from '@/lib/brand/website-url';
import { aiEnrichmentBudgetMs, optionalAssetBudgetMs, optionalResearchPageLimit, sharedWebsiteScanStageBudgetMs, shouldRetryHomepageForVisuals, WEBSITE_DNS_VALIDATION_BUDGET_MS, WEBSITE_SCAN_BUDGET_MS } from '@/lib/brand/website-analysis-budget';

export const maxDuration = 90;

function sameSite(a: string, b: string): boolean {
  const host = (value: string) => new URL(value).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const hostA = host(a);
  const hostB = host(b);
  return hostA === hostB || hostA.endsWith('.' + hostB) || hostB.endsWith('.' + hostA);
}

type FetchOutcome =
  | { ok: true; html: string; finalUrl: string; renderedFallback?: boolean }
  | { ok: false; reason: string; finalUrl: string | null };

type RenderedResearch = { title: string | null; text: string };

function renderedPageHtml(rendered: RenderedResearch): string {
  const title = (rendered.title ?? '').replace(/[<>]/g, '');
  const text = rendered.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<html><head><title>${title}</title></head><body><main><p>${text}</p></main></body></html>`;
}


async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchHtml(root: URL, maxRedirects = 3, userAgent = env().RESEARCH_USER_AGENT, allowReaderFallback = true, sharedSignal?: AbortSignal): Promise<FetchOutcome> {
  let target = root.toString();
  let finalUrl: string | null = null;

  for (let redirects = 0; redirects <= Math.min(env().MAX_RESEARCH_REDIRECTS, maxRedirects); redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(env().RESEARCH_TIMEOUT_MS, 7000));
    try {
      const response = await fetchPublicHttp(target, {
        signal: sharedSignal ? AbortSignal.any([controller.signal, sharedSignal]) : controller.signal,
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
          const rendered = await fetchRenderedResearch(target, 9_000, sharedSignal);
          if (rendered) {
            return { ok: true, html: renderedPageHtml(rendered), finalUrl: target, renderedFallback: true };
          }
        }
        return { ok: false, reason: `The website responded with HTTP ${response.status}.`, finalUrl: target };
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('html') && !contentType.includes('xhtml')) {
        return { ok: false, reason: 'That URL did not return an HTML page.', finalUrl: target };
      }
      const bounded = await readBoundedBody(response, Math.min(env().MAX_RESEARCH_BYTES, 900_000));
      if (isBlockedWebsiteResponse(bounded.content)) {
        if (allowReaderFallback) {
          const rendered = await fetchRenderedResearch(target, 9_000, sharedSignal);
          if (rendered) return { ok: true, html: renderedPageHtml(rendered), finalUrl: target, renderedFallback: true };
        }
        return { ok: false, reason: 'The website returned a security/block page instead of its public homepage.', finalUrl: target };
      }
      return { ok: true, html: bounded.content, finalUrl: target };
    } catch {
      if (sharedSignal?.aborted) return { ok: false, reason: 'The shared website scan deadline was reached.', finalUrl: finalUrl ?? target };
      const rendered = allowReaderFallback ? await fetchRenderedResearch(target, 9_000, sharedSignal) : null;
      if (rendered) {
        return {
          ok: true,
          html: renderedPageHtml(rendered),
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

const BROWSER_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchFallbackFirstPartyPage(root: URL, sharedSignal?: AbortSignal): Promise<FetchOutcome | null> {
  // If the canonical root is blocked or only an app shell, try a small set of
  // conventional locale, company and product paths on the same public host.
  // Every candidate must return substantive first-party content; path names are
  // discovery hints only and are never treated as evidence by themselves.
  if (root.pathname !== '/' && root.pathname !== '/index.html') return null;
  const candidates = ['/in/', '/us/', '/about/', '/products/'];
  const results = await Promise.all(candidates.map(async (pathname): Promise<FetchOutcome | null> => {
    try {
      const candidate = assertPublicHttpUrl(new URL(pathname, root).toString());
      await assertResolvablePublicHost(candidate.hostname);
      const result = await fetchHtml(candidate, 2, BROWSER_USER_AGENT, false, sharedSignal);
      if (result.ok) {
        const page = pageText(result.html);
        const opening = (page.title ?? '') + ' ' + page.text.slice(0, 800);
        const $ = cheerio.load(result.html);
        const mainHeading = $('main h1, article h1, [role="main"] h1, h1').first().text().replace(/\s+/g, ' ').trim();
        const hasReaderError = /(?:\b404\b|page not found|page does not exist|site is experiencing technical difficulty|access denied)/i.test(opening);
        // The global shell heuristic is intentionally conservative for roots.
        // A short About/Product page with a real H1 and substantive body text is
        // still valid evidence and should not be discarded just for being concise.
        if (page.text.length >= 180 && (!shouldUseRenderedWebsiteFallback(result.html) || mainHeading.length >= 3) && !hasReaderError) {
          return result;
        }
      }

      // Some sites block ordinary requests or return only an app shell for every
      // locale path. Give each candidate one short rendered-reader attempt.
      const rendered = await fetchRenderedResearch(candidate.toString(), 3_000, sharedSignal);
      if (!rendered) {
        return result.ok
          ? { ok: false, reason: 'The regional homepage did not contain usable public website content.', finalUrl: result.finalUrl }
          : result;
      }
      const page = pageText(renderedPageHtml(rendered));
      const opening = (page.title ?? '') + ' ' + page.text.slice(0, 800);
      if (page.text.length < 180 || /(?:\b404\b|page not found|page does not exist|site is experiencing technical difficulty|access denied)/i.test(opening)) {
        return { ok: false, reason: 'The rendered regional homepage did not contain usable public website content.', finalUrl: candidate.toString() };
      }
      return {
        ok: true,
        html: renderedPageHtml(rendered),
        finalUrl: candidate.toString(),
        renderedFallback: true,
      };
    } catch {
      return null;
    }
  }));
  return results.find((result): result is FetchOutcome & { ok: true } => result?.ok === true) ?? null;
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

async function fetchScriptText(url: string, sharedSignal?: AbortSignal): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const safe = assertPublicHttpUrl(url);
    await assertResolvablePublicHost(safe.hostname);
    const response = await fetchPublicHttp(safe.toString(), {
      signal: sharedSignal ? AbortSignal.any([controller.signal, sharedSignal]) : controller.signal,
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

async function fetchRasterColors(url: string, sharedSignal?: AbortSignal): Promise<RasterColorSample[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const safe = assertPublicHttpUrl(url);
    await assertResolvablePublicHost(safe.hostname);
    const response = await fetchPublicHttp(safe.toString(), {
      signal: sharedSignal ? AbortSignal.any([controller.signal, sharedSignal]) : controller.signal,
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

async function fetchCss(url: string, sharedSignal?: AbortSignal): Promise<string> {
  let safe: URL;
  try {
    safe = assertPublicHttpUrl(url);
    await assertResolvablePublicHost(safe.hostname);
  } catch {
    return '';
  }

  // Some public CDNs serve a block/error interstitial to the crawler identity.
  // Retry only that stylesheet with a standard browser user-agent, keeping each
  // attempt bounded and accepting only real CSS rather than an HTML error page.
  const agents = [...new Set([env().RESEARCH_USER_AGENT, BROWSER_USER_AGENT])];
  for (const userAgent of agents) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetchPublicHttp(safe.toString(), {
        signal: sharedSignal ? AbortSignal.any([controller.signal, sharedSignal]) : controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': userAgent, accept: 'text/css,*/*;q=0.1' },
      });
      if (!response.ok) continue;
      const type = (response.headers.get('content-type') || '').toLowerCase();
      if (type.includes('text/html') || type.includes('application/json') || type.includes('javascript') || type.startsWith('image/')) continue;
      const bounded = await readBoundedBody(response, 350_000);
      const content = bounded.content;
      // Some hosts serve declared stylesheets as text/plain or omit content-type
      // on hashed CSS routes. Validate response content before accepting it.
      const looksLikeCss = /(?:--[\w-]+\s*:|(?:^|[;{\s])(?:color|background(?:-color)?|font-family|@import)\s*:?)|[^{}]+\{[^{}]*\}/i.test(content);
      if (!content.trim() || (!type.includes('css') && !/\.css(?:[?#]|$)/i.test(safe.toString()) && !looksLikeCss)) continue;
      return content;
    } catch {
      // A failed request can be retried once with the alternate user-agent.
    } finally {
      clearTimeout(timeout);
    }
  }
  return '';
}


async function verifyPublicLogoAsset(url: string, sharedSignal?: AbortSignal): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const safe = assertPublicHttpUrl(url);
    await assertResolvablePublicHost(safe.hostname);
    const response = await fetchPublicHttp(safe.toString(), {
      signal: sharedSignal ? AbortSignal.any([controller.signal, sharedSignal]) : controller.signal,
      redirect: 'manual',
      headers: {
        'user-agent': env().RESEARCH_USER_AGENT,
        accept: 'image/svg+xml,image/png,image/jpeg,image/webp,image/avif,image/gif,*/*;q=0.1',
      },
    });
    if (!response.ok) return null;
    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!type.startsWith('image/')) return null;
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > 1_500_000) return null;
    if (type.includes('svg')) {
      const body = await readBoundedBody(response, 180_000);
      if (!/<svg[\s>]/i.test(body.content)) return null;
    }
    return safe.toString();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyConventionalIcon(baseUrl: string, sharedSignal?: AbortSignal): Promise<string | null> {
  // Prefer explicit logo assets when published at conventional first-party paths;
  // use favicon/app icons only as a final fallback. Every candidate is verified
  // by a successful image response before it is returned.
  const candidates = [
    '/logo.svg',
    '/assets/logo.svg',
    '/logo.png',
    '/images/logo.svg',
    '/apple-touch-icon.png',
    '/favicon.svg',
    '/favicon.ico',
  ];
  const results = await Promise.all(candidates.map(async (path) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const candidate = assertPublicHttpUrl(new URL(path, baseUrl).toString());
      await assertResolvablePublicHost(candidate.hostname);
      const response = await fetchPublicHttp(candidate.toString(), {
        signal: sharedSignal ? AbortSignal.any([controller.signal, sharedSignal]) : controller.signal,
        redirect: 'manual',
        headers: { 'user-agent': env().RESEARCH_USER_AGENT, accept: 'image/*' },
      });
      if (!response.ok) return null;
      const type = (response.headers.get('content-type') ?? '').toLowerCase();
      if (type.startsWith('image/')) return candidate.toString();
      if (/(?:html|json|javascript)/i.test(type)) return null;
      if (/\.(?:svg|png|ico)$/i.test(path) && !type) return candidate.toString();
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

async function fetchRenderedResearch(url: string, maxWaitMs = 9_000, sharedSignal?: AbortSignal): Promise<RenderedResearch | null> {
  let source: URL;
  try {
    source = assertPublicHttpUrl(url);
    source.hash = '';
  } catch {
    return null;
  }

  // Keep reader recovery generic. Some public hosts behave differently when
  // their page is fetched through an HTTPS- or HTTP-origin reader URL.
  const targets = [source.toString()];
  const alternateProtocol = new URL(source);
  alternateProtocol.protocol = source.protocol === 'https:' ? 'http:' : 'https:';
  if (!targets.includes(alternateProtocol.toString())) targets.push(alternateProtocol.toString());

  const deadline = Date.now() + Math.min(Math.max(env().RESEARCH_TIMEOUT_MS, 6_000), maxWaitMs);
  for (const target of targets) {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const response = await fetch('https://r.jina.ai/' + target, {
        signal: sharedSignal ? AbortSignal.any([controller.signal, sharedSignal]) : controller.signal,
        headers: {
          accept: 'text/plain',
          ...(env().JINA_API_KEY ? { authorization: 'Bearer ' + env().JINA_API_KEY } : {}),
        },
      });
      if (!response.ok) continue;
      const text = (await response.text()).trim();
      if (text.length < 180 || isRenderedReaderError(text)) continue;
      const lines = text.split('\n').map((line) => line.trim());
      const title = lines.find((line) => line.startsWith('# '))?.slice(2).trim()
        || lines.find((line) => /^title:\s*\S/i.test(line))?.replace(/^title:\s*/i, '').trim()
        || null;
      return { title, text: text.slice(0, 50_000) };
    } catch {
      // Retry the same public page through the alternate scheme within the shared deadline.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
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
  $('script,style,noscript,svg,template,header,nav,footer,aside,[role="banner"],[role="navigation"],[role="contentinfo"],[aria-label*="navigation"],[id*="cookie"],[class*="cookie"]').remove();
  const title = $('title').first().text().replace(/\s+/g, ' ').trim() || null;
  // Prefer substantive page content over repeated navigation and footer links.
  // Fall back to cleaned body text for sites without semantic content landmarks.
  const main = $('main, [role="main"], article').first();
  const content = main.length ? main : $('body');
  const ctaLabels = new Set<string>();
  content.find('a,button,[role="button"]').each((_index, element) => {
    const node = $(element);
    const label = node.text().replace(/\s+/g, ' ').trim();
    if (!isWebsiteActionLabel(label) || isGenericWebsiteNavLabel(label)) return;
    // Preserve real card headings and image alt text; only remove the standalone
    // short action label from the prose provided to structured extraction.
    if (node.find('h1,h2,h3,h4,img').length) return;
    ctaLabels.add(label);
    node.empty();
  });
  const primaryText = content.text();
  const readableText = primaryText.replace(/\s+/g, ' ').trim();
  const actionText = ctaLabels.size ? ' Visible calls to action: ' + [...ctaLabels].slice(0, 16).join(' · ') : '';
  const text = (readableText + actionText).trim().slice(0, 16_000);
  return { title, text };
}

function prioritizedLinks(html: string, rootUrl: string): string[] {
  const $ = cheerio.load(html);
  const root = new URL(rootUrl);
  const rootHost = normalizeWebsiteHostname(root.hostname);
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
    if (normalizeWebsiteHostname(parsed.hostname) !== rootHost) return;
    if (parsed.hash) return;
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(?:utm_.+|icid|bc|source|campaign|cmp|ref|_gl|gclid|fbclid)$/i.test(key)) parsed.searchParams.delete(key);
    }

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
    .slice(0, 6)
    .map(([url]) => url);
}

function externalStylesheetUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const scores = new Map<string, number>();
  const add = (raw: string | undefined, priority: number) => {
    const href = absoluteUrl(raw, baseUrl);
    if (!href) return;
    try {
      const parsed = assertPublicHttpUrl(href);
      const url = parsed.toString();
      const path = (parsed.pathname + parsed.search).toLowerCase();
      // Prefer explicitly linked stylesheets and likely site-wide design tokens
      // over unrelated preloads when a page declares many CSS resources.
      const assetSignal = /(?:^|[-_/.])(core|base|theme|global|main|style|styles|design|brand|token)(?:[-_/.]|$)/i.test(path) ? 8 : 0;
      const sameOriginSignal = parsed.origin === new URL(baseUrl).origin ? 2 : 0;
      scores.set(url, Math.max(scores.get(url) ?? 0, priority + assetSignal + sameOriginSignal));
    } catch {
      // Invalid schemes, credentials and non-standard ports are rejected.
    }
  };
  $('link[href]').each((_i, el) => {
    const node = $(el);
    const rel = (node.attr('rel') ?? '').toLowerCase().split(/\s+/);
    const as = (node.attr('as') ?? '').toLowerCase();
    const href = node.attr('href') ?? '';
    if (rel.includes('stylesheet')) add(href, 30);
    else if (rel.includes('preload') && as === 'style') add(href, 20);
    else if (/\.css(?:[?#]|$)/i.test(href)) add(href, 15);
  });
  $('style').each((_i, el) => {
    const css = $(el).text();
    for (const match of css.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/gi)) {
      if (match[1]) add(match[1], 10);
    }
  });
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([url]) => url);
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
  for (const css of cssBlocks) collectColors(css, 'external-stylesheet', sink);
  // Analyse CSS together so font variables defined in one bundle can resolve
  // font-family declarations in another. Body/heading assignments outrank an
  // incidental @font-face declaration or a linked font that is never used.
  const fonts = rankExtractedFonts([
    ...identity.fonts,
    ...extractDeclaredFonts(cssBlocks.join('\n')),
  ]).slice(0, 10);
  for (const asset of assetBlocks) collectColors(asset, 'logo-svg-color', sink);
  for (const script of scriptBlocks) collectJavaScriptDesignTokens(script, sink);
  for (const sample of rasterColors) {
    const entry = sink.get(sample.hex) ?? { count: 0, sources: new Set<string>() };
    entry.count += rasterColorEvidenceWeight(sample.count);
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
    fonts,
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
        (externalPalette.length > 0 || mergedPalette.some((color) => color.role !== 'neutral')) &&
        warning.includes('No usable colour declarations')),
    ),
  };
}

type CssResource = { url: string; css: string };

async function fetchCssTree(url: string, depth = 0, seen = new Set<string>(), sharedSignal?: AbortSignal): Promise<CssResource[]> {
  let normalized: string;
  try {
    normalized = assertPublicHttpUrl(url).toString();
  } catch {
    return [];
  }
  if (seen.has(normalized)) return [];
  seen.add(normalized);
  const css = await fetchCss(normalized, sharedSignal);
  if (!css) return [];
  if (depth >= 1) return [{ url: normalized, css }];

  const imported = new Set<string>();
  for (const match of css.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/gi)) {
    try {
      imported.add(assertPublicHttpUrl(new URL(match[1]!, normalized).toString()).toString());
    } catch {
      // Ignore invalid or unsafe nested imports.
    }
  }
  const children = await Promise.all([...imported].slice(0, 2).map((child) => fetchCssTree(child, depth + 1, seen, sharedSignal)));
  return [{ url: normalized, css }, ...children.flat()];
}

async function attachSourceFontAssets(
  fonts: ExtractedIdentity['fonts'],
  resources: CssResource[],
): Promise<ExtractedIdentity['fonts']> {
  if (fonts.length === 0 || resources.length === 0) return fonts;

  const knownFamilies = new Set(fonts.map((font) => font.family.trim().toLowerCase()));
  const candidates = new Map<string, { url: string; format?: 'woff2' | 'woff' | 'opentype' | 'truetype'; weight?: string; style?: string }>();
  const rankFormat = (format: string | undefined) => format === 'woff2' ? 4 : format === 'woff' ? 3 : format === 'opentype' ? 2 : format === 'truetype' ? 1 : 0;

  for (const resource of resources) {
    const css = resource.css.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const face of css.matchAll(/@font-face\s*\{([^{}]*)\}/gi)) {
      const declarations = face[1] ?? '';
      const family = declarations.match(/font-family\s*:\s*([^;]+)/i)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ');
      if (!family || !knownFamilies.has(family.toLowerCase())) continue;

      const src = declarations.match(/src\s*:\s*([^;]+)/i)?.[1] ?? '';
      const urls = [...src.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)]
        .map((match) => match[2]?.trim())
        .filter((value): value is string => Boolean(value) && !/^data:/i.test(value!));
      const weightRaw = declarations.match(/font-weight\s*:\s*([^;]+)/i)?.[1]?.trim();
      const styleRaw = declarations.match(/font-style\s*:\s*([^;]+)/i)?.[1]?.trim();
      const weight = weightRaw && /^(?:normal|bold|[1-9]00(?:\s+[1-9]00)?)$/i.test(weightRaw) ? weightRaw : undefined;
      const style = styleRaw && /^(?:normal|italic|oblique(?:\s+-?\d+(?:deg)?)?)$/i.test(styleRaw) ? styleRaw : undefined;

      for (const rawUrl of urls) {
        try {
          const safe = assertPublicHttpUrl(new URL(rawUrl, resource.url).toString()).toString();
          const parsed = new URL(safe);
          const extension = parsed.pathname.match(/\.(woff2?|ttf|otf)$/i)?.[1]?.toLowerCase();
          const format = extension === 'woff2' ? 'woff2' : extension === 'woff' ? 'woff' : extension === 'otf' ? 'opentype' : extension === 'ttf' ? 'truetype' : undefined;
          const key = family.toLowerCase();
          const previous = candidates.get(key);
          if (!previous || rankFormat(format) > rankFormat(previous.format)) {
            candidates.set(key, { url: safe, ...(format ? { format } : {}), ...(weight ? { weight } : {}), ...(style ? { style } : {}) });
          }
        } catch {
          // Ignore data URLs, private hosts, credentials and non-HTTP font sources.
        }
      }
    }
  }

  const verified = new Map<string, { url: string; format?: 'woff2' | 'woff' | 'opentype' | 'truetype'; weight?: string; style?: string }>();
  const checkedHosts = new Set<string>();
  for (const [family, candidate] of candidates) {
    try {
      const hostname = new URL(candidate.url).hostname;
      if (!checkedHosts.has(hostname)) {
        await assertResolvablePublicHost(hostname);
        checkedHosts.add(hostname);
      }
      verified.set(family, candidate);
    } catch {
      // A font asset is optional. A failed DNS/public-host check leaves the family unavailable.
    }
  }

  return fonts.map((font) => {
    const asset = verified.get(font.family.trim().toLowerCase());
    if (!asset) return font;
    return {
      ...font,
      fontAssetUrl: asset.url,
      ...(asset.format ? { fontAssetFormat: asset.format } : {}),
      ...(asset.weight ? { fontWeight: asset.weight } : {}),
      ...(asset.style ? { fontStyle: asset.style } : {}),
    };
  });
}
async function fetchSvgAsset(url: string, sharedSignal?: AbortSignal): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const safe = assertPublicHttpUrl(url);
    await assertResolvablePublicHost(safe.hostname);
    const response = await fetchPublicHttp(safe.toString(), {
      signal: sharedSignal ? AbortSignal.any([controller.signal, sharedSignal]) : controller.signal,
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

async function fetchManifestVisuals(html: string, baseUrl: string, sharedSignal?: AbortSignal): Promise<{ colors: string[]; icons: string[] }> {
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
        signal: sharedSignal ? AbortSignal.any([controller.signal, sharedSignal]) : controller.signal,
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


const GENERIC_WEBSITE_NAV_LABELS = new Set([
  'home', 'menu', 'search', 'about', 'about us', 'all products', 'products', 'services',
  'support', 'help', 'back to top', 'skip to main content', 'privacy', 'privacy policy',
  'privacy choices', 'terms', 'terms of use', 'cookie settings', 'account', 'account profile',
  'sign in', 'log in', 'login', 'careers', 'news', 'blog', 'language', 'settings',
]);

function isGenericWebsiteNavLabel(value: string): boolean {
  return GENERIC_WEBSITE_NAV_LABELS.has(value.replace(/\s+/g, ' ').trim().toLowerCase()) ||
    /^skip to (?:main )?content\b/i.test(value.trim());
}

function isWebsiteActionLabel(value: string): boolean {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.length > 90 || /^skip to (?:main )?content\b/i.test(text)) return false;
  if (text.split(/\s+/).length > 9) return false;
  return /^(?:learn more|read more|shop now|buy now|pre[- ]?order(?: now)?|book now|quick book|event enquiry|discover more|find out more|see all|view all|sign up|sign in|log in|join now|start now|start free|try free|try now|contact sales|contact us|request a demo|get started|download|explore|discover|learn|read|shop|buy|book|join|start|try|get|find|contact|request|register|subscribe|watch|play|see|view|order|open|create|ask|help me|compare|choose|check|continue|submit|enquire|reserve|schedule|apply|select|claim|browse|talk to|meet with)\b/i.test(text);
}

function cleanWebsiteProfileList(
  values: string[],
  limit: number,
  mode: 'content' | 'offering' | 'cta' = 'content',
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.replace(/\s+/g, ' ').trim();
    const key = value.toLowerCase();
    if (value.length < 2 || value.length > 320 || seen.has(key)) continue;
    if (isGenericWebsiteNavLabel(value)) continue;
    if (mode === 'cta' ? !isWebsiteActionLabel(value) : mode === 'offering' && isWebsiteActionLabel(value)) continue;
    if (/^(?:©|all rights reserved|privacy choices|do not sell or share)/i.test(value)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function buildAiProfile(intelligence: Awaited<ReturnType<typeof extractBrandIntelligence>>['result']) {
  const combinedOfferings = intelligence.offer.productsAndServices;
  const products = cleanWebsiteProfileList(
    intelligence.offer.products.length ? intelligence.offer.products : combinedOfferings,
    20,
    'offering',
  );
  const productKeys = new Set(products.map((value) => value.toLowerCase()));
  const services = cleanWebsiteProfileList(intelligence.offer.services, 20, 'offering');
  const cleanContent = (values: string[], limit: number, stripActions = false) =>
    cleanWebsiteProfileList(values, limit, 'content')
      .filter((value) => !productKeys.has(value.toLowerCase()))
      .filter((value) => !stripActions || !isWebsiteActionLabel(value))
      .slice(0, limit);
  return {
    products,
    services,
    keyFeatures: cleanContent(intelligence.offer.keyFeatures, 16, true),
    benefits: cleanContent(intelligence.offer.benefits, 16, true),
    pricingSignals: cleanContent(intelligence.offer.pricingSignals, 12, true),
    audience: intelligence.audience.targetAudience,
    personas: intelligence.audience.buyerPersonas.slice(0, 8),
    customerTypes: cleanContent(intelligence.audience.customerTypes, 12),
    painPoints: cleanContent(intelligence.audience.painPoints, 12),
    useCases: cleanContent(intelligence.audience.useCases, 12),
    tone: cleanContent(intelligence.messaging.toneOfVoice, 6),
    terminology: cleanContent(intelligence.messaging.terminology, 20),
    recurringClaims: cleanContent(intelligence.messaging.recurringClaims, 12),
    messagingThemes: cleanContent(intelligence.messaging.messagingThemes, 12),
    valueProposition: intelligence.positioning.valueProposition,
    differentiators: cleanContent(intelligence.positioning.differentiators, 12),
    positioningThemes: cleanContent(intelligence.positioning.positioningThemes, 12),
    callsToAction: cleanWebsiteProfileList(intelligence.offer.callsToAction, 12, 'cta'),
    productCategories: cleanWebsiteProfileList(intelligence.identity.productCategories, 12, 'offering'),
    industry: intelligence.identity.industry,
    businessModel: intelligence.identity.businessModel,
    primaryMarket: intelligence.identity.primaryMarket,
    geography: intelligence.identity.geography,
    seo: {
      importantTopics: cleanContent(intelligence.seo.importantTopics, 12),
      keywordThemes: cleanContent(intelligence.seo.keywordThemes, 12),
      contentGaps: cleanContent(intelligence.seo.contentGaps, 12),
      searchIntentOpportunities: cleanContent(intelligence.seo.searchIntentOpportunities, 12),
    },
    competition: {
      namedCompetitors: cleanContent(intelligence.competition.namedCompetitors, 12),
      alternatives: cleanContent(intelligence.competition.alternatives, 12),
      differentiationClaims: cleanContent(intelligence.competition.differentiationClaims, 12),
    },
    evidence: intelligence.evidence
      .filter((item) => !isGenericWebsiteNavLabel(item.claim))
      .slice(0, 12),
  };
}


type WebsiteEvidencePage = { url: string; title: string | null; text: string };

function buildWebsiteEvidenceFallbackProfile(
  pages: WebsiteEvidencePage[],
  identity: ExtractedIdentity,
  homepageHtml: string,
): Record<string, unknown> {
  const headings: string[] = [];
  const paragraphs: string[] = [];
  const callsToAction: string[] = [];
  const productLinks: string[] = [];
  const serviceLinks: string[] = [];

  if (homepageHtml.trim()) {
    const $ = cheerio.load(homepageHtml);
    $('script,style,noscript,svg,template,header,nav,footer,aside,[role="banner"],[role="navigation"],[role="contentinfo"],[id*="cookie"],[class*="cookie"]').remove();
    const main = $('main,[role="main"],article').first();
    const content = main.length ? main : $('body');

    content.find('h1,h2,h3,h4,[role="heading"]').each((_index, element) => {
      const value = $(element).text().replace(/\s+/g, ' ').trim();
      if (value.length >= 3 && value.length <= 140 &&
          !isGenericWebsiteNavLabel(value) && !/^(?:skip to|back to top)\b/i.test(value)) {
        headings.push(value);
      }
    });
    content.find('p').each((_index, element) => {
      const value = $(element).text().replace(/\s+/g, ' ').trim();
      if (value.length >= 24 && value.length <= 520) paragraphs.push(value);
    });

    content.find('a[href],button,[role="button"]').each((_index, element) => {
      const node = $(element);
      const label = node.text().replace(/\s+/g, ' ').trim();
      if (label.length < 2 || label.length > 90 || isGenericWebsiteNavLabel(label)) return;
      if (isWebsiteActionLabel(label)) {
        callsToAction.push(label);
        return; // An action verb is not the product/service name.
      }
      const href = node.attr('href') ?? '';
      const parentCard = node.closest('article,li,[class*="card"],[class*="product"],[class*="service"],[class*="tile"]');
      const parentHeading = parentCard.find('h1,h2,h3,h4,[role="heading"]').first().text().replace(/\s+/g, ' ').trim();
      const productPath = /\/(?:products?|platforms?|apps?|games?|devices?|plans?|store)(?:[/?#-]|$)/i.test(href);
      const servicePath = /\/(?:services?|solutions?|experiences?|events?|bookings?|pricing)(?:[/?#-]|$)/i.test(href);
      if (productPath) {
        productLinks.push(parentHeading.length >= 3 && parentHeading.length <= 140 ? parentHeading : label);
      } else if (servicePath) {
        serviceLinks.push(parentHeading.length >= 3 && parentHeading.length <= 140 ? parentHeading : label);
      } else if (/\b(?:product|platform|app|application|game|device|laptop|tablet|console|software|plan|subscription|database|tool|suite|productivity|cloud)\b/i.test(label)) {
        productLinks.push(label);
      } else if (/\b(?:service|solution|booking|event|experience|membership|support plan)\b/i.test(label)) {
        serviceLinks.push(label);
      }
    });
  }

  const sentences = pages.flatMap((page) =>
    page.text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“‘])/)
      .map((claim) => claim.trim())
      .filter((claim) => claim.length >= 24 && claim.length <= 520 &&
        !isGenericWebsiteNavLabel(claim) &&
        !/cookie policy|privacy policy|terms of use|all rights reserved|skip to main content/i.test(claim))
      .map((claim) => ({ claim, sourceUrl: page.url })),
  );
  const uniqueText = (values: string[], limit = 12, minLength = 2, mode: 'content' | 'offering' | 'cta' = 'content'): string[] => {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const raw of values) {
      const value = raw.replace(/\s+/g, ' ').trim();
      const key = value.toLowerCase();
      if (value.length < minLength || value.length > 320 || seen.has(key)) continue;
      if (isGenericWebsiteNavLabel(value)) continue;
      if (mode === 'cta' ? !isWebsiteActionLabel(value) : mode === 'offering' && isWebsiteActionLabel(value)) continue;
      if (/^(?:©|all rights reserved|privacy choices|do not sell or share)/i.test(value)) continue;
      seen.add(key);
      result.push(value);
      if (result.length >= limit) break;
    }
    return result;
  };

  const sectionHeadings = uniqueText([
    ...headings,
    ...pages.map((page) => (page.title ?? '').replace(/\s+[|—–:]\s+.*$/, '').trim()),
  ], 16, 3);
  const statements = uniqueText([...paragraphs, ...sentences.map((item) => item.claim)], 24, 24);
  const evidence = sentences.slice(0, 12);
  const evidenceText = [identity.description ?? '', ...sectionHeadings, ...statements].join(' ');
  const lowerEvidence = evidenceText.toLowerCase();

  const benefitSignals = statements.filter((value) =>
    /\b(?:helps?|enables?|designed to|built to|make it easier|save time|faster|simpler|powerful|seamless|unforgettable|access from any device|battery life|all-day|cloud storage|productivity apps|AI features|secure|collaborate|connect|automate)\b/i.test(value),
  );
  const featureSignals = statements.filter((value) =>
    /\b(?:powered by|includes?|features?|with built-in|supports?|compatible with|cloud storage|AI features|battery life|security|collaboration|productivity|performance|portability|flexibility|access from any device|manage|automate|connect|integrate|stream|sync)\b/i.test(value),
  );
  const pricingSignals = statements.filter((value) =>
    /(?:[$₹€£]\s?\d|\b(?:pricing|price|per month|monthly|annual plan|free trial|free plan|starting at|from \d+|subscription|discount|save \d+%|% off)\b)/i.test(value),
  );

  let audience: string | null = null;
  let customerTypes: string[] = [];
  if (/\bfor (?:your )?home or business\b/i.test(evidenceText)) {
    audience = 'Home users and businesses';
    customerTypes = ['Home users', 'Businesses'];
  } else if (/\bfor (?:consumers and businesses|individuals and businesses)\b/i.test(evidenceText)) {
    audience = 'Consumers and businesses';
    customerTypes = ['Consumers', 'Businesses'];
  } else {
    const audiencePatterns: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\bfor (?:small and medium[- ]sized businesses|SMBs)\b/i, label: 'Small and medium-sized businesses' },
      { pattern: /\bfor (?:developers|software teams)\b/i, label: 'Developers and software teams' },
      { pattern: /\bfor (?:students|teachers|schools|educators)\b/i, label: 'Students and educators' },
      { pattern: /\bfor (?:families|parents|children|kids)\b/i, label: 'Families' },
      { pattern: /\bfor (?:gamers|players)\b/i, label: 'Gamers and players' },
      { pattern: /\bfor (?:teams|businesses|enterprises|organizations|organisations|professionals)\b/i, label: 'Teams and businesses' },
    ];
    for (const item of audiencePatterns) {
      if (item.pattern.test(evidenceText)) {
        audience = item.label;
        customerTypes = [item.label];
        break;
      }
    }
  }

  const technologySignals = lowerEvidence.match(/\b(?:software|cloud|apps?|applications?|operating system|computing|devices?|laptop|tablet|console|digital platform|AI features|productivity|database|developer tools|cybersecurity)\b/g) ?? [];
  let industry: string | null = technologySignals.length >= 3 ? 'Technology and software' : null;
  if (!industry && /\b(?:restaurant|bar|hotel|hospitality|food and drink|venue bookings|party venue|leisure experience)\b/i.test(evidenceText)) {
    industry = 'Hospitality and leisure';
  } else if (!industry && /\b(?:banking|insurance|financial services|payments|investment platform)\b/i.test(evidenceText)) {
    industry = 'Financial services';
  } else if (!industry && /\b(?:healthcare|clinical|patient care|medical services)\b/i.test(evidenceText)) {
    industry = 'Healthcare';
  } else if (!industry && /\b(?:courses|curriculum|school|learning platform|education services)\b/i.test(evidenceText)) {
    industry = 'Education and learning';
  } else if (!industry && /\b(?:online shop|e-commerce|retail store|shop online)\b/i.test(evidenceText)) {
    industry = 'Retail and e-commerce';
  }

  const hasSubscriptionSignal = /\b(?:subscription|subscription-based|monthly|annual plan|per month|membership)\b/i.test(evidenceText);
  const hasPlanSignal = /\b(?:plan|pricing|price|trial)\b/i.test(evidenceText);
  const hasSalesSignal = /\b(?:shop|buy|purchase|pre-order|order now|product sales|available to buy)\b/i.test(evidenceText);
  const businessModel = hasSubscriptionSignal && hasSalesSignal
    ? 'Product sales and subscriptions'
    : hasPlanSignal && hasSalesSignal
      ? 'Product sales and paid plans'
      : hasSubscriptionSignal
        ? 'Subscription-based services or plans'
        : hasSalesSignal
          ? 'Direct product sales'
          : null;

  const differentiatedClaims = statements.filter((value) =>
    /\b(?:only|first|unique|largest|award[- ]winning|leading|fastest|exclusive|unlike|number one|no\. 1)\b/i.test(value),
  );
  const useCases = statements.filter((value) =>
    /\b(?:book|host|play|create|design|build|stream|watch|learn|shop|order|collaborate|travel|manage|explore|discover|access|automate|work smarter|save your files)\b/i.test(value) &&
    !isWebsiteActionLabel(value),
  );
  const products = uniqueText(productLinks, 12, 2, 'offering');
  const services = uniqueText(serviceLinks, 12, 2, 'offering');
  const productKeys = new Set(products.map((value) => value.toLowerCase()));
  const cleanFeatures = uniqueText([...featureSignals, ...benefitSignals], 16, 18)
    .filter((value) => !productKeys.has(value.toLowerCase()) && !isWebsiteActionLabel(value));
  const cleanBenefits = uniqueText(benefitSignals, 12, 18)
    .filter((value) => !productKeys.has(value.toLowerCase()) && !isWebsiteActionLabel(value));
  const cleanThemes = sectionHeadings.filter((heading) => !productKeys.has(heading.toLowerCase()));

  return {
    products,
    services,
    keyFeatures: cleanFeatures,
    benefits: cleanBenefits,
    pricingSignals: uniqueText(pricingSignals, 12, 8),
    audience,
    personas: [],
    customerTypes,
    painPoints: uniqueText(statements.filter((value) =>
      /\b(?:challenge|problem|struggle|pain point|time-consuming|complex|difficult|frustrat|need to|tired of)\b/i.test(value),
    ), 10, 12),
    useCases: uniqueText(useCases, 12, 12),
    tone: [],
    terminology: [],
    recurringClaims: [],
    messagingThemes: uniqueText(cleanThemes, 12, 3),
    valueProposition: identity.description ?? sectionHeadings[0] ?? null,
    differentiators: uniqueText(differentiatedClaims, 10, 12),
    positioningThemes: uniqueText(cleanThemes, 12, 3),
    callsToAction: uniqueText(callsToAction, 12, 2, 'cta'),
    productCategories: products,
    industry,
    businessModel,
    primaryMarket: audience ? (customerTypes.includes('Businesses') || /businesses|teams/i.test(audience) ? 'Consumer and business markets' : null) : null,
    geography: null,
    seo: {
      importantTopics: uniqueText(cleanThemes, 12, 3),
      keywordThemes: [],
      contentGaps: [],
      searchIntentOpportunities: [],
    },
    competition: { namedCompetitors: [], alternatives: [], differentiationClaims: [] },
    evidence,
    profileSource: 'first-party-website-copy',
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
  const scanStartedAt = Date.now();
  const elapsed = () => Date.now() - scanStartedAt;
  const scanController = new AbortController();
  const scanDeadlineTimer = setTimeout(() => scanController.abort(new Error('The shared website scan deadline was reached')), WEBSITE_SCAN_BUDGET_MS);
  let scanHostname: string | null = null;
  const runWithinBudget = async <T>(operation: (signal: AbortSignal) => Promise<T>, requestedMs: number, message: string): Promise<T> => {
    const stageBudgetMs = sharedWebsiteScanStageBudgetMs(elapsed(), requestedMs);
    if (stageBudgetMs <= 0) throw new Error(`${message}: shared website scan budget exhausted`);
    const stageController = new AbortController();
    const signal = AbortSignal.any([scanController.signal, stageController.signal]);
    try {
      return await withTimeout(operation(signal), stageBudgetMs, message, () => stageController.abort(new Error(message)));
    } finally {
      if (!stageController.signal.aborted) stageController.abort(new Error('Website scan stage finished'));
    }
  };
  try {
    const auth = await runWithinBudget(async () => requireOrgRole(CAN_VIEW_DASHBOARD), 5_000, 'Workspace authorization exceeded the shared website scan budget');
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const raw = new URL(request.url).searchParams.get('url')?.trim();
    if (!raw) return NextResponse.json({ error: 'Website URL is required.' }, { status: 400 });

    const root = assertPublicHttpUrl(raw);
    scanHostname = root.hostname;
    await runWithinBudget(() => assertResolvablePublicHost(root.hostname), WEBSITE_DNS_VALIDATION_BUDGET_MS, 'Website DNS validation exceeded the shared scan budget');

    let outcome = await runWithinBudget((signal) => fetchHtml(root, 3, env().RESEARCH_USER_AGENT, false, signal), 8_000, 'Homepage recovery exceeded the shared website scan budget');

    // A second user-agent request is useful for ordinary HTTP failures, but
    // repeating a confirmed HTTP-200 block interstitial wastes the scan budget.
    if (!outcome.ok && !/(?:security\/block page|HTTP (?:401|403|407|429|451))/i.test(outcome.reason)) {
      const browserOutcome = await runWithinBudget((signal) => fetchHtml(root, 3, BROWSER_USER_AGENT, false, signal), 8_000, 'Browser homepage retry exceeded the shared website scan budget').catch(() => null);
      if (browserOutcome?.ok) outcome = browserOutcome;
    }
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
      const rendered = await runWithinBudget((signal) => fetchRenderedResearch(outcome.finalUrl ?? root.toString(), 9_000, signal), 9_000, 'Rendered homepage recovery exceeded the shared website scan budget').catch(() => null);
      if (rendered && rendered.text.length >= 180 && rendered.text.length > directPage.text.length + 100) {
        renderedFallbackText = rendered.text;
        renderedFallbackTitle = rendered.title ?? directPage.title;
      }
    } else if (!outcome.ok) {
      const rendered = await runWithinBudget((signal) => fetchRenderedResearch(outcome.finalUrl ?? root.toString(), 9_000, signal), 9_000, 'Rendered fallback exceeded the shared website scan budget').catch(() => null);
      if (!rendered) {
        const regional = await runWithinBudget((signal) => fetchFallbackFirstPartyPage(root, signal), 10_000, 'Regional fallback exceeded the shared website scan budget').catch(() => null);
        if (regional?.ok) {
          outcome = regional;
          if (regional.renderedFallback) {
            const regionalPage = pageText(regional.html);
            renderedFallbackText = regionalPage.text;
            renderedFallbackTitle = regionalPage.title;
          }
        } else {
          return NextResponse.json(
            { error: outcome.reason + ' The public-page reader could not recover enough real first-party content from the homepage or common company/product pages, so no Brand IQ was created. Retry later, or enter a public About/Product page URL directly.', identity: null },
            { status: 422, headers: { 'Cache-Control': 'no-store' } },
          );
        }
      } else {
        renderedFallbackText = rendered.text;
        renderedFallbackTitle = rendered.title;
      }
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
    const scanNotices: string[] = [];
    const inlineCssAvailable = /<style\b[^>]*>[\s\S]*?\S[\s\S]*?<\/style>/i.test(baseHtml);
    const directMarkupLooksLikeShell = !baseHtml || shouldUseRenderedWebsiteFallback(baseHtml);
    const directVisualStylesUnavailable = !baseHtml || (directMarkupLooksLikeShell && !inlineCssAvailable && stylesheetUrls.length === 0);
    if (renderedFallbackText && directVisualStylesUnavailable) {
      if (!identity.brandName?.trim()) identity.brandName = brandNameFromWebsiteUrl(baseUrl);
      // Filter notices caused only by the synthetic reader wrapper, and only
      // when that wrapper was genuinely required because direct visuals were unavailable.
      identity.warnings = identity.warnings.filter((warning) =>
        !warning.includes('No embedded stylesheet found') &&
        !warning.includes('No usable colour declarations were found'),
      );
      scanNotices.push('The public-page reader recovered text because the page markup or stylesheets were not directly readable. Visual identity uses independently verified public assets where available.');
    }

    // Start logo recovery while the optional homepage and child-page checks run.
    // This must finish before the insufficient-evidence gate, or short reader-only
    // pages could be rejected even when their actual logo is recoverable.
    const readerLogoTask: Promise<Array<string | null>> = !identity.logoUrl && renderedFallbackText
      ? withTimeout(
          Promise.all(extractRenderedLogoCandidates(renderedFallbackText, baseUrl).slice(0, 2).map((url) => verifyPublicLogoAsset(url, scanController.signal))),
          sharedWebsiteScanStageBudgetMs(elapsed(), 2_800),
          'Rendered-reader logo verification exceeded its budget',
        ).catch(() => [] as Array<string | null>)
      : Promise.resolve([]);

    // If the scraper user-agent received a rendered-reader fallback or HTML
    // without discoverable CSS, retry the public page once with a normal browser
    // user-agent. This does not bypass URL/DNS safety and never runs unbounded.
    if (shouldRetryHomepageForVisuals(elapsed(), Boolean(renderedFallbackText), Boolean(baseHtml), stylesheetUrls.length)) {
      const browserPage = await runWithinBudget((signal) => fetchHtml(
        root,
        3,
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        false,
        signal,
      ), 7_500, 'Visual homepage retry exceeded the shared website scan budget').catch(() => null);
      if (browserPage?.ok && !browserPage.renderedFallback) {
        const browserStyles = externalStylesheetUrls(browserPage.html, browserPage.finalUrl);
        if (!baseHtml || browserStyles.length > stylesheetUrls.length || browserPage.html.length > baseHtml.length + 250) {
          baseHtml = browserPage.html;
          baseUrl = browserPage.finalUrl;
          identity = mergeVisualIdentity(identity, extractBrandIdentity(browserPage.html, browserPage.finalUrl));
        }
        stylesheetUrls = [...new Set([...stylesheetUrls, ...browserStyles])].slice(0, 12);
      }
    }

    const directLinks = baseHtml ? prioritizedLinks(baseHtml, baseUrl) : [];
    const readerLinks = renderedFallbackText ? renderedResearchLinks(renderedFallbackText, baseUrl) : [];
    const pageCandidates = [...new Set([...directLinks, ...readerLinks])]
      .filter((url) => sameSite(baseUrl, url))
      .slice(0, 9);
    const pageUrls = [baseUrl, ...pageCandidates];
    const evidencePages: Array<{ url: string; title: string | null; text: string }> = [];

    const directHomepage = outcome.ok ? pageText(outcome.html) : null;
    const usedRenderedFallback = outcome.ok === true && outcome.renderedFallback === true;
    const homepage = renderedFallbackText && (!directHomepage || usedRenderedFallback || renderedFallbackText.length > directHomepage.text.length)
      ? { title: renderedFallbackTitle ?? directHomepage?.title ?? null, text: renderedFallbackText }
      : directHomepage ?? { title: renderedFallbackTitle, text: renderedFallbackText ?? '' };
    evidencePages.push({ url: baseUrl, ...homepage });

    // When the homepage could only be read through the text reader, avoid
    // re-fetching the blocked host directly and then retrying the reader for
    // nine links. Two short, same-origin reader pages add evidence without
    // exhausting the function's 45-second request budget.
    const readerOnlyFallback = Boolean(renderedFallbackText && !baseHtml);
    const pageLimit = optionalResearchPageLimit(elapsed());
    const researchPageCandidates = pageCandidates.slice(0, readerOnlyFallback ? Math.min(2, pageLimit) : pageLimit);
    const pageFetchBudgetMs = sharedWebsiteScanStageBudgetMs(elapsed(), optionalAssetBudgetMs(elapsed(), 5_000));
    const extraPages = pageFetchBudgetMs > 0 && researchPageCandidates.length > 0
      ? await runWithinBudget((signal) => Promise.all(researchPageCandidates.map(async (url, index) => {
      if (readerOnlyFallback) {
        const rendered = await fetchRenderedResearch(url, 3_500, signal);
        return rendered && rendered.text.trim().length >= 180
          ? { url, title: rendered.title, text: rendered.text }
          : null;
      }

      const page = await fetchHtml(new URL(url), 1, env().RESEARCH_USER_AGENT, true, signal);
      if (page.ok === false) return null;
      const direct = pageText(page.html);
      if (page.ok === true && page.renderedFallback) return { url: page.finalUrl, ...direct };

      // Keep this fallback bounded across child pages so a shell-heavy site
      // can contribute real evidence without turning one scan into an
      // unbounded set of third-party rendering requests.
      if (index < 3 && shouldUseRenderedWebsiteFallback(page.html)) {
        const rendered = await fetchRenderedResearch(page.finalUrl, 5_500, signal);
        if (rendered && rendered.text.length > direct.text.length + 100) {
          return { url: page.finalUrl, title: rendered.title ?? direct.title, text: rendered.text };
        }
      }
      return { url: page.finalUrl, ...direct };
    })), pageFetchBudgetMs, 'Optional first-party page crawl exceeded its shared deadline')
        .catch(() => [] as Array<{ url: string; title: string | null; text: string } | null>)
      : [];
    for (const page of extraPages) if (page?.text?.trim()) evidencePages.push(page);

    const verifiedReaderLogos = await readerLogoTask;
    if (!identity.logoUrl) {
      const readerLogo = verifiedReaderLogos.find((url): url is string => Boolean(url));
      if (readerLogo) {
        identity.logoUrl = readerLogo;
        identity.inspected.push('logo image referenced by rendered reader and verified as public');
      }
    }

    const accessibleTextChars = evidencePages.reduce((total, page) => total + page.text.trim().length, 0);
    const hasVisualEvidence = Boolean(identity.logoUrl || identity.faviconUrl || identity.palette.length);
    if (shouldRejectInsufficientWebsiteEvidence(accessibleTextChars, hasVisualEvidence)) {
      return NextResponse.json(
        {
          error: 'The website was reached, but the scan could not verify enough readable first-party content to build a reliable Brand IQ. The site may require JavaScript rendering or block automated readers. Try its canonical homepage URL or retry later; no guessed company profile was created.',
          identity: null,
          diagnostics: { pageCount: evidencePages.length, accessibleTextChars, renderedReaderUsed: Boolean(renderedFallbackText) },
        },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }


    let aiProfile: Record<string, unknown> | null = null;
    let aiModelCompleted = false;
    let aiFallbackUsed = false;
    const aiWarnings: string[] = [];
    const aiController = new AbortController();
    const abortAiWithScan = () => aiController.abort(scanController.signal.reason);
    if (scanController.signal.aborted) abortAiWithScan();
    else scanController.signal.addEventListener('abort', abortAiWithScan, { once: true });
    // Start structured extraction as soon as the text evidence is ready. The
    // optional stylesheet/icon work below runs concurrently instead of stealing
    // all the time before AI gets a chance to start.
    const aiTask = (async () => {
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
            const aiBudgetMs = aiEnrichmentBudgetMs(elapsed());
            if (aiBudgetMs <= 0) {
              aiWarnings.push('AI enrichment could not start because public-page recovery used the scan deadline.');
            } else {
              const perProviderBudgetMs = providers.length > 1 ? Math.min(14_000, aiBudgetMs) : aiBudgetMs;
              const extractionRun = await withTimeout(
                runWithProviderFailover(
                  providers,
                  async (provider) => {
                    const providerController = new AbortController();
                    const abortWithScan = () => providerController.abort(aiController.signal.reason);
                    if (aiController.signal.aborted) providerController.abort(aiController.signal.reason);
                    else aiController.signal.addEventListener('abort', abortWithScan, { once: true });

                    const providerTimeoutMessage = `AI provider ${provider.id} exceeded its allocated website-enrichment budget`;
                    try {
                      const websiteModel = websiteEnrichmentModel(provider.id, provider.defaultModel);
                      return await withTimeout(
                        extractBrandIntelligence(provider, evidence, websiteModel, {
                          signal: providerController.signal,
                          fastFail: true,
                          websiteFastMode: true,
                          maxEvidenceChars: 12_000,
                          maxSources: 8,
                          maxTokens: 3_200,
                        }),
                        perProviderBudgetMs,
                        providerTimeoutMessage,
                        () => providerController.abort(new Error(providerTimeoutMessage)),
                      ).catch((error: unknown) => {
                        // Invalid JSON/schema is a provider failure; allow failover.
                        if (error instanceof BrandIntelligenceValidationError) {
                          throw new AiProviderError(provider.id, 'Structured Brand IQ output failed validation', 502);
                        }
                        // A provider-local timeout is retryable by the registry.
                        // A scan-wide timeout must stop all fallback attempts.
                        if (!aiController.signal.aborted && error instanceof Error && error.message === providerTimeoutMessage) {
                          throw new AiProviderError(provider.id, providerTimeoutMessage, 504);
                        }
                        throw error;
                      });
                    } finally {
                      aiController.signal.removeEventListener('abort', abortWithScan);
                    }
                  },
                  undefined,
                  aiController.signal,
                ),
                aiBudgetMs,
                'AI enrichment exceeded its bounded time budget',
                () => aiController.abort(new Error('AI enrichment deadline reached')),
              );
              aiProfile = buildAiProfile(extractionRun.result.result);
              aiModelCompleted = true;
              if (!identity.brandName && extractionRun.result.result.identity.brandName) identity.brandName = extractionRun.result.result.identity.brandName;
              if (!identity.description && extractionRun.result.result.identity.companyDescription) identity.description = extractionRun.result.result.identity.companyDescription;
            }
          } else {
            aiWarnings.push('AI enrichment needs more readable first-party page text.');
          }
        }
      } catch (error) {
        if (error instanceof AiProviderError && error.status === 429 && /tokens? per day|\\bTPD\\b/i.test(error.message)) {
          aiWarnings.push(
            `AI enrichment failed: ${error.provider} daily organization quota is exhausted. Retry after it resets or configure a fallback provider with separate quota; another key in the same organization shares the same daily limit.`,
          );
        } else {
          aiWarnings.push(error instanceof Error ? `AI enrichment failed: ${error.message}` : 'AI enrichment failed.');
        }
      }
    })();

    // Some sites publish only an app manifest, or an SVG logo contains the
    // brand palette when the HTML has no authored CSS.
    const manifestBudgetMs = baseHtml ? sharedWebsiteScanStageBudgetMs(elapsed(), optionalAssetBudgetMs(elapsed(), 3_000)) : 0;
    const manifestVisuals = baseHtml && manifestBudgetMs > 0
      ? await withTimeout(
          fetchManifestVisuals(baseHtml, baseUrl, scanController.signal),
          manifestBudgetMs,
          'Optional manifest inspection exceeded its budget',
        ).catch(() => ({ colors: [], icons: [] }))
      : { colors: [], icons: [] };
    if (!identity.logoUrl && manifestVisuals.icons[0]) identity.logoUrl = manifestVisuals.icons[0];
    if (!identity.faviconUrl && manifestVisuals.icons[0]) identity.faviconUrl = manifestVisuals.icons[0];

    // A blocked homepage can still expose its own verified favicon/icon paths.
    // Use only a successful same-origin image response; never infer a logo URL.
    if (!identity.logoUrl || !identity.faviconUrl) {
      const conventionalIcon = await withTimeout(verifyConventionalIcon(baseUrl, scanController.signal), sharedWebsiteScanStageBudgetMs(elapsed(), 2_800), 'Optional icon fallback exceeded its budget').catch(() => null);
      if (conventionalIcon) {
        identity.logoUrl = identity.logoUrl ?? conventionalIcon;
        identity.faviconUrl = identity.faviconUrl ?? conventionalIcon;
        if (!identity.inspected.includes('verified conventional favicon fallback')) {
          identity.inspected.push('verified conventional favicon fallback');
        }
      }
    }

    // Preserve time for the required identity response. Optional visual enrichment
    // yields first if blocked-host recovery has already consumed most of the route budget.
    // Share one visited set across all top-level stylesheets. Modern sites often
    // link the same theme/base CSS through preload and stylesheet tags; fetching
    // those imports repeatedly wastes the small serverless scan budget.
    const visitedCssUrls = new Set<string>();
    // Stylesheets enrich colours/fonts, but must never consume the whole website scan.
    const cssBudgetMs = elapsed() < 54_000 ? optionalAssetBudgetMs(elapsed(), 4_000) : 0;
    const cssResources = cssBudgetMs > 0
      ? await withTimeout(
          Promise.all(stylesheetUrls.slice(0, 6).map((url) => fetchCssTree(url, 0, visitedCssUrls, scanController.signal)))
            .then((resources) => resources.flat()),
          cssBudgetMs,
          'Optional stylesheet inspection exceeded its budget',
        ).catch(() => [])
      : [];
    const cssBlocks = cssResources.map((resource) => resource.css);
    // The server may expose SVG assets behind extensionless CDN/asset URLs.
    // Ask the response validator whether a candidate is SVG instead of relying
    // on the URL suffix; ordinary PNG/ICO candidates are rejected by fetchSvgAsset.
    const svgUrls = [...new Set([identity.logoUrl, identity.faviconUrl, ...manifestVisuals.icons])]
      .filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url))
      .filter((url) => !/\.(?:png|jpe?g|gif|ico|webp|avif)(?:[?#]|$)/i.test(url))
      .slice(0, 3);
    const svgBudgetMs = elapsed() < 56_000 ? optionalAssetBudgetMs(elapsed(), 2_500) : 0;
    const svgResults = svgBudgetMs > 0
      ? await withTimeout(
          Promise.all(svgUrls.slice(0, 2).map((url) => fetchSvgAsset(url, scanController.signal))),
          svgBudgetMs,
          'Optional logo SVG inspection exceeded its budget',
        ).catch(() => [])
      : [];
    const svgBlocks: string[] = svgResults.filter((asset): asset is string => typeof asset === 'string');

    // Modern frameworks frequently keep theme colours in JS/CSS-in-JS bundles
    // instead of HTML or standalone CSS. Read only explicitly declared public
    // scripts, with strict time and byte caps.
    const canFetchOptionalAssets = elapsed() < 56_000;
    const inlineScripts = baseHtml && canFetchOptionalAssets ? inlineScriptBlocks(baseHtml) : [];
    const scriptBudgetMs = canFetchOptionalAssets ? optionalAssetBudgetMs(elapsed(), 2_500) : 0;
    const externalScripts = baseHtml && scriptBudgetMs > 0
      ? (await withTimeout(
          Promise.all(externalScriptUrls(baseHtml, baseUrl).slice(0, 2).map((url) => fetchScriptText(url, scanController.signal))),
          scriptBudgetMs,
          'Optional design-token script inspection exceeded its budget',
        ).catch(() => []))
          .filter((script): script is string => Boolean(script))
      : [];
    const scriptBlocks: string[] = [...inlineScripts, ...externalScripts.filter((script): script is string => typeof script === 'string')];
    const rasterUrls = !canFetchOptionalAssets ? [] : (baseHtml
      ? rasterLogoUrls(baseHtml, baseUrl, [identity.logoUrl, identity.faviconUrl, ...manifestVisuals.icons]).slice(0, 3)
      : [identity.logoUrl, identity.faviconUrl].filter((url): url is string => Boolean(url)).slice(0, 2));
    const rasterBudgetMs = canFetchOptionalAssets ? optionalAssetBudgetMs(elapsed(), 1_800) : 0;
    const rasterColors: RasterColorSample[] = rasterBudgetMs > 0
      ? (await withTimeout(
          Promise.all(rasterUrls.map((url) => fetchRasterColors(url, scanController.signal))).then((samples) => samples.flat()),
          rasterBudgetMs,
          'Optional raster colour inspection exceeded its budget',
        ).catch(() => []))
      : [];

    identity = mergeExternalCss(identity, cssBlocks, svgBlocks, manifestVisuals.colors, rasterColors, scriptBlocks);
    const fontAssetBudgetMs = elapsed() < 57_000 ? optionalAssetBudgetMs(elapsed(), 1_000) : 0;
    const fontsWithAssets = fontAssetBudgetMs > 0
      ? await withTimeout(
          attachSourceFontAssets(identity.fonts, cssResources),
          fontAssetBudgetMs,
          'Optional font asset validation exceeded its budget',
        ).catch(() => identity.fonts)
      : identity.fonts;
    identity = { ...identity, fonts: fontsWithAssets };

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

    await aiTask;

    // Provider failures are handled internally. Keep Brand IQ usable by falling
    // back to real copy, headings, CTAs and URLs from the public site. Unknown
    // structured facts remain null or empty instead of being fabricated.
    if (!aiProfile) {
      aiProfile = buildWebsiteEvidenceFallbackProfile(evidencePages, identity, baseHtml);
      aiFallbackUsed = true;
    }

    const warnings = [...new Set(identity.warnings)];
    console.info(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      msg: 'Website identity scan completed',
      hostname: scanHostname,
      elapsedMs: elapsed(),
      renderedReaderUsed: Boolean(renderedFallbackText),
      directHtmlAvailable: Boolean(baseHtml),
      evidencePageCount: evidencePages.length,
      stylesheetCount: cssBlocks.length,
      aiModelCompleted,
      aiFallbackUsed,
      aiFailureCount: aiWarnings.length,
      aiFailureSummary: aiWarnings.map((warning) => warning.slice(0, 180)),
      warningCount: warnings.length,
    }));
    const enriched = {
      ...identity,
      assets,
      aiProfile,
      scanNotices: [...new Set(scanNotices)],
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
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Could not inspect the website.';
    const status = /URL|hostname|protocol|port|resolve|public host/i.test(message) ? 400
      : /shared website scan budget exhausted|shared website scan deadline|exceeded the shared website scan budget/i.test(message) ? 504 : 500;
    if (status >= 500) {
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        msg: 'Website identity scan failed',
        hostname: scanHostname,
        elapsedMs: elapsed(),
        status,
        error: message,
      }));
    }
    return NextResponse.json({ error: message, identity: null }, { status, headers: { 'Cache-Control': 'no-store' } });
  } finally {
    clearTimeout(scanDeadlineTimer);
    if (!scanController.signal.aborted) scanController.abort(new Error('Website scan request finished'));
  }
}
