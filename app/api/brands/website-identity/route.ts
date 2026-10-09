import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { requireOrgRole, CAN_VIEW_DASHBOARD } from '@/lib/auth/roles';
import { env } from '@/lib/env';
import { assertPublicHttpUrl, assertResolvablePublicHost, fetchPublicHttp, readBoundedBody } from '@/lib/research/url-security';
import { extractBrandIdentity, parseCssColor, rankPalette, shouldUseRenderedWebsiteFallback, type ExtractedColor, type ExtractedIdentity } from '@/lib/brand/visual-extraction';
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

async function fetchHtml(root: URL, maxRedirects = 3): Promise<FetchOutcome> {
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
          'user-agent': env().RESEARCH_USER_AGENT,
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
        if ([401, 403, 407, 408, 429, 451, 500, 502, 503, 504].includes(response.status)) {
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
      const rendered = await fetchRenderedResearch(target);
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
    const type = response.headers.get('content-type') || '';
    if (!type.includes('css') && !url.includes('.css')) return '';
    const bounded = await readBoundedBody(response, 350_000);
    return bounded.content;
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
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
  $('link[rel="stylesheet"]').each((_i, el) => {
    const href = absoluteUrl($(el).attr('href'), baseUrl);
    if (href && sameSite(baseUrl, href)) urls.add(href);
  });
  $('link[rel~="preload"][as="style"]').each((_i, el) => {
    const href = absoluteUrl($(el).attr('href'), baseUrl);
    if (href && sameSite(baseUrl, href)) urls.add(href);
  });
  return [...urls].slice(0, 8);
}

function mergeExternalCss(identity: ExtractedIdentity, cssBlocks: string[]): ExtractedIdentity {
  if (cssBlocks.length === 0) return identity;
  const sink = new Map<string, { count: number; sources: Set<string> }>();
  const fonts = new Map(identity.fonts.map((font) => [font.family.toLowerCase(), font]));
  const colorToken = /(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/g;

  for (const css of cssBlocks) {
    const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const match of cleaned.matchAll(colorToken)) {
      const hex = parseCssColor(match[0]);
      if (!hex) continue;
      const current = sink.get(hex) ?? { count: 0, sources: new Set<string>() };
      current.count += 1;
      current.sources.add('external-stylesheet');
      sink.set(hex, current);
    }

    const semanticDecl = /--(?:brand|primary|secondary|accent|color-primary|color-secondary|brand-color)(?:-[a-z0-9-]+)?\\s*:\\s*([^;}]+)/gi;
    for (const match of cleaned.matchAll(semanticDecl)) {
      const hex = parseCssColor(match[1] ?? '');
      if (!hex) continue;
      const current = sink.get(hex) ?? { count: 0, sources: new Set<string>() };
      current.count += 5;
      current.sources.add('semantic-css');
      sink.set(hex, current);
    }
    for (const match of cleaned.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
      const family = (match[1] ?? '').split(',')[0].replace(/["']/g, '').trim();
      if (family.length >= 2 && family.length <= 60 && !/^(inherit|initial|unset|sans-serif|serif|monospace)$/i.test(family)) {
        const key = family.toLowerCase();
        if (!fonts.has(key)) fonts.set(key, { family, source: 'css-declaration', evidence: match[0].slice(0, 100) });
      }
    }
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
    inspected: [...identity.inspected, `${cssBlocks.length} external stylesheet(s)`],
    warnings: identity.warnings.filter((warning) => !warning.includes('inline stylesheet')),
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
    const baseHtml = outcome.ok && !outcome.renderedFallback ? outcome.html : '';
    const baseUrl = outcome.ok ? outcome.finalUrl : raw;
    const stylesheetUrls = baseHtml ? externalStylesheetUrls(baseHtml, baseUrl) : [];
    const cssBlocks = (await Promise.all(stylesheetUrls.map(fetchCss))).filter(Boolean);
    identity = mergeExternalCss(identity, cssBlocks);

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
      if (!outcome.ok) return [];
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
