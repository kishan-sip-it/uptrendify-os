import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { requireOrgRole, CAN_VIEW_DASHBOARD } from '@/lib/auth/roles';
import { env } from '@/lib/env';
import { assertPublicHttpUrl, assertResolvablePublicHost, fetchPublicHttp, readBoundedBody } from '@/lib/research/url-security';
import { extractBrandIdentity, parseCssColor, rankPalette, type ExtractedColor, type ExtractedIdentity } from '@/lib/brand/visual-extraction';
import { createDefaultRegistry } from '@/lib/ai/registry';
import { buildEvidenceContext, extractBrandIntelligence, type EvidenceFragment } from '@/lib/ai/brand-intelligence';

export const maxDuration = 45;

function sameSite(a: string, b: string): boolean {
  const host = (value: string) => new URL(value).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const hostA = host(a);
  const hostB = host(b);
  return hostA === hostB || hostA.endsWith('.' + hostB) || hostB.endsWith('.' + hostA);
}

type FetchOutcome =
  | { ok: true; html: string; finalUrl: string }
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

      if (!response.ok) return { ok: false, reason: `The website responded with HTTP ${response.status}.`, finalUrl: target };
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('html') && !contentType.includes('xhtml')) {
        return { ok: false, reason: 'That URL did not return an HTML page.', finalUrl: target };
      }
      const bounded = await readBoundedBody(response, Math.min(env().MAX_RESEARCH_BYTES, 900_000));
      return { ok: true, html: bounded.content, finalUrl: target };
    } catch {
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
  const rootHost = root.hostname.replace(/^www\./, '');
  const scored = new Map<string, number>();
  const keywords = [
    ['product', 10], ['service', 10], ['solution', 9], ['offer', 9], ['about', 8],
    ['company', 7], ['who', 7], ['audience', 6], ['customer', 6], ['pricing', 5],
    ['contact', 3], ['work', 3], ['portfolio', 3],
  ] as const;

  $('a[href]').each((_i, el) => {
    const href = absoluteUrl($(el).attr('href'), rootUrl);
    if (!href) return;
    let parsed: URL;
    try { parsed = new URL(href); } catch { return; }
    if (parsed.hostname.replace(/^www\./, '') !== rootHost) return;
    if (parsed.pathname === '/' || parsed.hash) return;
    const path = `${parsed.pathname} ${$(el).text()}`.toLowerCase();
    const score = keywords.reduce((sum, [keyword, weight]) => sum + (path.includes(keyword) ? weight : 0), 0);
    if (score > 0) scored.set(parsed.toString(), Math.max(score, scored.get(parsed.toString()) ?? 0));
  });

  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([url]) => url);
}

function externalStylesheetUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('link[rel="stylesheet"]').each((_i, el) => {
    const href = absoluteUrl($(el).attr('href'), baseUrl);
    if (href) urls.add(href);
  });
  $('link[rel~="preload"][as="style"]').each((_i, el) => {
    const href = absoluteUrl($(el).attr('href'), baseUrl);
    if (href) urls.add(href);
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
  return {
    products: intelligence.offer.productsAndServices.slice(0, 20),
    services: intelligence.offer.productsAndServices.slice(0, 20),
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
    businessModel: intelligence.identity.businessModel,
    primaryMarket: intelligence.identity.primaryMarket,
    geography: intelligence.identity.geography,
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
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.reason, identity: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }

    let identity = extractBrandIdentity(outcome.html, outcome.finalUrl);
    const stylesheetUrls = externalStylesheetUrls(outcome.html, outcome.finalUrl);

    const pageCandidates = prioritizedLinks(outcome.html, outcome.finalUrl);
    const pageUrls = [outcome.finalUrl, ...pageCandidates];
    const evidencePages: Array<{ url: string; title: string | null; text: string }> = [];

    const homepage = pageText(outcome.html);
    evidencePages.push({ url: outcome.finalUrl, ...homepage });

    // CSS and same-domain evidence are independent once the homepage is known.
    // Fetch them concurrently so a slow stylesheet does not add its full latency
    // on top of the page crawl before AI enrichment can begin.
    const [cssResults, extraPages] = await Promise.all([
      Promise.all(stylesheetUrls.map(fetchCss)),
      Promise.all(pageCandidates.map(async (url) => {
        const page = await fetchHtml(new URL(url), 1);
        if (!page.ok) return null;
        return { url: page.finalUrl, ...pageText(page.html) };
      })),
    ]);
    for (const page of extraPages) if (page?.text) evidencePages.push(page);

    const cssBlocks = cssResults.filter(Boolean);
    identity = mergeExternalCss(identity, cssBlocks);

    const assets = (() => {
      const $ = cheerio.load(outcome.html);
      const found = new Map<string, { url: string; type: string; label: string | null }>();
      $('img[src],source[src],video[poster]').each((_i, el) => {
        const node = $(el);
        const candidate = node.attr('src') ?? node.attr('poster');
        const url = absoluteUrl(candidate, outcome.finalUrl);
        if (!url || found.has(url)) return;
        found.set(url, { url, type: 'image', label: node.attr('alt') ?? null });
      });
      return [...found.values()].slice(0, 18);
    })();

    let aiProfile: Record<string, unknown> | null = null;
    const aiWarnings: string[] = [];
    try {
      const provider = createDefaultRegistry().default();
      if (!provider) {
        aiWarnings.push('AI enrichment is unavailable because no configured primary AI provider was found.');
      } else {
        const fragments: EvidenceFragment[] = evidencePages
          .filter((page) => page.text.trim())
          .map((page) => ({ url: page.url, title: page.title, text: page.text }));
        const evidence = buildEvidenceContext(fragments);
        if (evidence.length > 0) {
          const extraction = await extractBrandIntelligence(provider, evidence);
          aiProfile = buildAiProfile(extraction.result);
          if (!identity.brandName && extraction.result.identity.brandName) identity.brandName = extraction.result.identity.brandName;
          if (!identity.description && extraction.result.identity.companyDescription) identity.description = extraction.result.identity.companyDescription;
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
