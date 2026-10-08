import * as cheerio from 'cheerio';
import { assertPublicHttpUrl, assertResolvablePublicHost } from './research/url-security';

export type BrandWebsiteCandidate = {
  title: string;
  url: string;
  host: string;
  iconUrl: string | null;
  accessNote?: string | null;
};

type SearchProvider = 'google' | 'bing' | 'duckduckgo';

type RankedCandidate = BrandWebsiteCandidate & {
  score: number;
  providers: Set<SearchProvider>;
};

const SEARCH_HOSTS = new Set([
  'google.com','www.google.com','bing.com','www.bing.com','search.brave.com',
  'duckduckgo.com','www.duckduckgo.com','html.duckduckgo.com',
]);

const SOCIAL_HOSTS = new Set([
  'youtube.com','www.youtube.com','facebook.com','www.facebook.com',
  'instagram.com','www.instagram.com','linkedin.com','www.linkedin.com',
  'x.com','www.x.com','tiktok.com','www.tiktok.com',
]);

const DISCOVERY_CACHE_TTL_MS = 60_000;
const DISCOVERY_CACHE_MAX_ENTRIES = 100;
const discoveryCache = new Map<string, { expiresAt: number; candidates: BrandWebsiteCandidate[] }>();

export function clearBrandDiscoveryCache(): void {
  discoveryCache.clear();
}

const TLD_PRIORITY: Record<string, number> = {
  // TLD is only a tie-breaker, but an exact brand-domain match on a
  // conventional public web domain should beat an otherwise equivalent
  // alternative extension such as .io.
  com: 90,
  org: 28,
  net: 24,
  co: 20,
  app: 14,
  io: 8,
  ai: 8,
  dev: 6,
};

function extractSearchTarget(raw: string): string {
  try {
    const url = new URL(raw, 'https://www.google.com');
    const host = url.hostname.toLowerCase();
    if (!SEARCH_HOSTS.has(host)) return raw;
    const target = ['q', 'uddg', 'url', 'u'].map((key) => url.searchParams.get(key)).find(Boolean);
    if (!target) return raw;
    return decodeURIComponent(target);
  } catch {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
}

function normalizeCandidate(raw: string, brandQuery = ''): string | null {
  try {
    const unwrapped = extractSearchTarget(raw);
    const url = new URL(unwrapped);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname || '/';
    const host = url.hostname.toLowerCase();
    const normalizedHost = hostKey(host);
    if (SEARCH_HOSTS.has(host)) return null;
    if (SOCIAL_HOSTS.has(host)) {
      const queryKey = compact(brandQuery);
      const hostKeyName = normalizedHost.split('.')[0] ?? '';
      if (!queryKey || !domainVariants(queryKey).includes(hostKeyName)) return null;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function hostKey(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).map((part) => part.trim()).filter(Boolean);
}

function rootDomain(host: string): string {
  return hostKey(host).split('.').slice(0, -1).join('.');
}

function domainTld(host: string): string {
  const parts = hostKey(host).split('.');
  return parts[parts.length - 1] ?? '';
}

function domainVariants(queryCompact: string): string[] {
  const variants = new Set<string>([queryCompact]);
  if (queryCompact.endsWith('s') && queryCompact.length > 3) variants.add(queryCompact.slice(0, -1));
  else if (queryCompact.length > 3) variants.add(queryCompact + 's');
  return Array.from(variants);
}

function scoreCandidate(
  candidate: BrandWebsiteCandidate,
  query: string,
  engineScore = 0,
): number {
  const queryCompact = compact(query);
  const queryDomains = domainVariants(queryCompact);
  const queryWords = words(query);
  const host = hostKey(candidate.host);
  const domain = compact(rootDomain(host));
  const title = compact(candidate.title);
  let score = engineScore;

  if (domain === queryCompact) score += 78;
  else if (queryDomains.includes(domain)) score += 68;
  else if (domain.startsWith(queryCompact) || queryCompact.startsWith(domain)) score += 38;
  else if (domain.includes(queryCompact) || queryCompact.includes(domain)) score += 25;

  if (title === queryCompact) score += 46;
  else if (title.includes(queryCompact)) score += 30;

  const titleWords = new Set(words(candidate.title));
  const matchingWords = queryWords.filter((word) => titleWords.has(word)).length;
  score += matchingWords * 11;

  const hostWords = new Set(words(rootDomain(host)));
  score += queryWords.filter((word) => hostWords.has(word)).length * 9;

  const tld = domainTld(host);
  score += TLD_PRIORITY[tld] ?? 0;
  if (candidate.url.startsWith('https://')) score += 4;

  try {
    const path = new URL(candidate.url).pathname;
    if (path === '/' || path === '') score += 6;
  } catch {
    // normalizeCandidate already guarantees URL shape.
  }

  return score;
}

function rankAndDedupe(candidates: RankedCandidate[]): BrandWebsiteCandidate[] {
  const byHost = new Map<string, RankedCandidate>();

  for (const candidate of candidates) {
    const key = hostKey(candidate.host);
    const existing = byHost.get(key);

    if (!existing) {
      byHost.set(key, candidate);
      continue;
    }

    // Only independent search providers count as consensus. Repeated results
    // from one provider must not manufacture a false "agreement" signal.
    const providers = new Set<SearchProvider>([
      ...existing.providers,
      ...candidate.providers,
    ]);
    const consensusBonus = Math.min(8, Math.max(0, providers.size - 1) * 4);
    const score = Math.max(existing.score, candidate.score) + consensusBonus;

    byHost.set(key, {
      ...(candidate.score >= existing.score ? candidate : existing),
      score,
      providers,
    });
  }

  return Array.from(byHost.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(({ score: _score, providers: _providers, ...candidate }) => candidate);
}

function isLikelyParkedPage(title: string, html: string): boolean {
  const haystack = (title + '\n' + html).toLowerCase();
  const strongMarkers = [
    'domain for sale',
    'this domain is for sale',
    'this domain is parked',
    'domain is parked',
    'buy this domain',
    'available for purchase',
    'make an offer for this domain',
    'afternic',
    'sedo',
    'hugedomains',
    'dan.com',
  ];
  const genericMarkers = ['coming soon', 'parked free', 'future home of'];
  if (strongMarkers.some((marker) => haystack.includes(marker))) return true;
  return genericMarkers.filter((marker) => haystack.includes(marker)).length >= 2;
}

function candidateTitle(html: string, fallback: string): string {
  try {
    const $ = cheerio.load(html);
    return $('title').first().text().replace(/\s+/g, ' ').trim() || fallback;
  } catch {
    return fallback;
  }
}

async function fetchHtml(url: string, timeoutMs = 2500): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (UpTrendifyOS brand discovery)',
        accept: 'text/html,application/xhtml+xml',
      },
      cache: 'no-store',
      redirect: 'follow',
    });
    if (!response.ok) return '';
    return await response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function probeUrl(url: string, timeoutMs = 1800): Promise<{ reachable: boolean; blocked: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      'user-agent': 'Mozilla/5.0 (UpTrendifyOS brand discovery)',
      accept: 'text/html,application/xhtml+xml',
    };
    const head = await fetch(url, { method: 'HEAD', signal: controller.signal, headers, cache: 'no-store', redirect: 'follow' });
    if ((head.status >= 200 && head.status < 400) || head.status === 401 || head.status === 403 || head.status === 429) {
      return { reachable: true, blocked: head.status === 401 || head.status === 403 || head.status === 429 };
    }
    if ([405, 501].includes(head.status)) {
      const get = await fetch(url, { method: 'GET', signal: controller.signal, headers, cache: 'no-store', redirect: 'follow' });
      return {
        reachable: get.ok || [401, 403, 429].includes(get.status),
        blocked: [401, 403, 429].includes(get.status),
      };
    }
    return { reachable: false, blocked: false };
  } catch {
    return { reachable: false, blocked: false };
  } finally {
    clearTimeout(timer);
  }
}

function extractGoogleTarget(href: string): string {
  const match = href.match(/^\/url\?q=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : href;
}

async function searchBing(query: string, brandQuery: string): Promise<BrandWebsiteCandidate[]> {
  const html = await fetchHtml(
    'https://www.bing.com/search?count=10&setlang=en-US&q=' + encodeURIComponent(query),
  );
  if (!html) return [];

  const $ = cheerio.load(html);
  const results: BrandWebsiteCandidate[] = [];
  $('li.b_algo h2 a').each((_, element) => {
    const href = $(element).attr('href');
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    const normalized = href ? normalizeCandidate(href, brandQuery) : null;
    if (normalized && title && !isLikelyParkedPage(title, '')) {
      results.push({
        title,
        url: normalized,
        host: new URL(normalized).hostname,
        iconUrl: null,
      });
    }
  });
  return results;
}

async function searchGoogle(query: string, brandQuery: string): Promise<BrandWebsiteCandidate[]> {
  const html = await fetchHtml(
    'https://www.google.com/search?hl=en&num=10&q=' + encodeURIComponent(query),
  );
  if (!html) return [];
  const $ = cheerio.load(html);
  const results: BrandWebsiteCandidate[] = [];

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href') || '';
    const title = $(element).find('h3').first().text().trim();
    const target = extractGoogleTarget(href);
    const normalized = normalizeCandidate(target, brandQuery);
    if (normalized && title) {
      results.push({
        title,
        url: normalized,
        host: new URL(normalized).hostname,
        iconUrl: null,
      });
    }
  });

  return results;
}

async function searchDuckDuckGo(query: string, brandQuery: string): Promise<BrandWebsiteCandidate[]> {
  const html = await fetchHtml(
    'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query),
  );
  if (!html) return [];
  const $ = cheerio.load(html);
  const results: BrandWebsiteCandidate[] = [];

  $('.result__a').each((_, element) => {
    const href = $(element).attr('href');
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    const normalized = href ? normalizeCandidate(href, brandQuery) : null;
    if (normalized && title) {
      results.push({
        title,
        url: normalized,
        host: new URL(normalized).hostname,
        iconUrl: null,
      });
    }
  });
  return results;
}

function likelyDomainCandidates(query: string): string[] {
  const compactQuery = compact(query);
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!compactQuery && !slug) return [];

  const bases = [
    ...domainVariants(compactQuery),
    ...domainVariants(slug),
  ].filter(Boolean);
  const tlds = ['com', 'org', 'net', 'co', 'app', 'io', 'ai', 'dev'];

  const variants = new Set<string>();
  // Probe exact/closest compact domains on .com first so the bounded probe
  // cannot spend its entire budget on extension variants before the strongest
  // official-domain candidates are checked.
  for (const base of domainVariants(compactQuery)) {
    variants.add('https://' + base + '.com');
  }
  for (const base of bases) {
    for (const tld of tlds) {
      variants.add('https://' + base + '.' + tld);
    }
  }

  // Keep deterministic probing bounded while prioritizing the compact exact,
  // singular/plural .com forms before lower-priority extension variants.
  return Array.from(variants).slice(0, 24);
}

async function discoverDirectWebsite(query: string): Promise<BrandWebsiteCandidate[]> {
  const cleaned = query.trim();
  const candidateUrl = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(cleaned)
      ? 'https://' + cleaned
      : null;
  if (!candidateUrl) return [];

  try {
    const safe = assertPublicHttpUrl(candidateUrl);
    await assertResolvablePublicHost(safe.hostname);
    const probe = await probeUrl(safe.toString(), 2200);
    if (!probe.reachable) return [];

    const html = probe.blocked ? '' : await fetchHtml(safe.toString(), 1800);
    const host = safe.hostname;
    const title = html ? candidateTitle(html, host) : host;
    if (isLikelyParkedPage(title, html)) return [];

    return [{
      title,
      url: safe.toString().replace(/\/$/, ''),
      host,
      iconUrl: 'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(host),
      accessNote: probe.blocked
        ? 'This site is reachable but blocks automated inspection. You can still select the public URL.'
        : null,
    }];
  } catch {
    return [];
  }
}

async function discoverLikelyDomains(query: string): Promise<BrandWebsiteCandidate[]> {
  const urls = likelyDomainCandidates(query).slice(0, 12);

  const results: Array<BrandWebsiteCandidate | null> = await Promise.all(
    urls.map(async (candidateUrl): Promise<BrandWebsiteCandidate | null> => {
      const host = new URL(candidateUrl).hostname;
      const probe = await probeUrl(candidateUrl);
      if (!probe.reachable) return null;

      const html = probe.blocked ? '' : await fetchHtml(candidateUrl, 1500);
      const title = html ? candidateTitle(html, host) : host;
      if (isLikelyParkedPage(title, html)) return null;

      return {
        title,
        url: candidateUrl,
        host,
        iconUrl: 'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(host),
        accessNote: probe.blocked
          ? 'This site is reachable but blocks automated inspection. You can still select the public URL.'
          : null,
      };
    }),
  );

  return results.filter((result): result is BrandWebsiteCandidate => Boolean(result));
}

export async function discoverBrandWebsites(query: string): Promise<BrandWebsiteCandidate[]> {
  const cleaned = query.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2) return [];

  const cacheKey = cleaned.toLowerCase();
  const cached = discoveryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.candidates.map((candidate) => ({ ...candidate }));
  }
  if (cached) discoveryCache.delete(cacheKey);

  const searchQuery = cleaned + ' official website';

  const [bing, google, duckduckgo, likely, direct] = await Promise.all([
    searchBing(searchQuery, cleaned).catch(() => []),
    searchGoogle(searchQuery, cleaned).catch(() => []),
    searchDuckDuckGo(searchQuery, cleaned).catch(() => []),
    discoverLikelyDomains(cleaned).catch(() => []),
    discoverDirectWebsite(cleaned).catch(() => []),
  ]);

  const ranked: RankedCandidate[] = [];

  const addSearchResults = (
    results: BrandWebsiteCandidate[],
    provider: SearchProvider,
    engineWeight: number,
  ) => {
    results.forEach((candidate, index) => {
      ranked.push({
        ...candidate,
        score: scoreCandidate(candidate, cleaned, engineWeight * Math.max(0, 14 - index)),
        providers: new Set([provider]),
      });
    });
  };

  addSearchResults(google, 'google', 3.2);
  addSearchResults(bing, 'bing', 2.8);
  addSearchResults(duckduckgo, 'duckduckgo', 2.4);

  for (const candidate of likely) {
    ranked.push({
      ...candidate,
      score: scoreCandidate(candidate, cleaned, 0) + 55,
      providers: new Set(),
    });
  }

  for (const candidate of direct) {
    ranked.push({
      ...candidate,
      score: scoreCandidate(candidate, cleaned, 0) + 180,
      providers: new Set(),
    });
  }

  const candidates = rankAndDedupe(ranked);

  if (discoveryCache.size >= DISCOVERY_CACHE_MAX_ENTRIES) {
    const oldest = discoveryCache.keys().next().value;
    if (oldest) discoveryCache.delete(oldest);
  }
  discoveryCache.set(cacheKey, { expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS, candidates });

  return candidates.map((candidate) => ({ ...candidate }));
}
