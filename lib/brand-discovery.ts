import * as cheerio from 'cheerio';

export type BrandWebsiteCandidate = {
  title: string;
  url: string;
  host: string;
  iconUrl: string | null;
};

type SearchProvider = 'google' | 'bing' | 'duckduckgo';

type RankedCandidate = BrandWebsiteCandidate & {
  score: number;
  providers: Set<SearchProvider>;
};

const BLOCKED_HOSTS = new Set([
  'google.com','www.google.com','bing.com','www.bing.com','search.brave.com',
  'youtube.com','www.youtube.com','facebook.com','www.facebook.com',
  'instagram.com','www.instagram.com','linkedin.com','www.linkedin.com',
  'x.com','www.x.com','tiktok.com','www.tiktok.com',
]);

const TLD_PRIORITY: Record<string, number> = {
  // TLD is only a tie-breaker, but an exact brand-domain match on a
  // conventional public web domain should beat an otherwise equivalent
  // alternative extension such as .io.
  com: 72,
  org: 28,
  net: 24,
  co: 20,
  app: 14,
  io: 8,
  ai: 8,
  dev: 6,
};

function normalizeCandidate(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname || '/';
    if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) return null;
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
    const consensusBonus = Math.min(18, Math.max(0, providers.size - 1) * 9);
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

async function fetchHtml(url: string, timeoutMs = 4000): Promise<string> {
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

async function probeUrl(url: string, timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      'user-agent': 'Mozilla/5.0 (UpTrendifyOS brand discovery)',
      accept: 'text/html,application/xhtml+xml',
    };
    const head = await fetch(url, { method: 'HEAD', signal: controller.signal, headers, cache: 'no-store', redirect: 'follow' });
    if (head.ok || head.status === 401 || head.status === 403 || head.status === 429) return true;
    if ([405, 501].includes(head.status)) {
      const get = await fetch(url, { method: 'GET', signal: controller.signal, headers, cache: 'no-store', redirect: 'follow' });
      return get.ok || [401, 403, 429].includes(get.status);
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeIcon(raw: string | undefined, baseUrl: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, baseUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

async function enrichCandidate(candidate: Omit<BrandWebsiteCandidate, 'iconUrl'>): Promise<BrandWebsiteCandidate> {
  const html = await fetchHtml(candidate.url, 3000);
  if (!html) {
    return {
      ...candidate,
      iconUrl: 'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(candidate.host),
    };
  }

  const $ = cheerio.load(html);
  const pageTitle = $('title').first().text().replace(/\s+/g, ' ').trim();
  const iconHref =
    $('link[rel~="icon"][href]').first().attr('href') ||
    $('link[rel~="shortcut"][rel~="icon"][href]').first().attr('href') ||
    $('link[rel~="apple-touch-icon"][href]').first().attr('href') ||
    $('meta[property="og:image"][content]').first().attr('content');

  return {
    ...candidate,
    title: pageTitle || candidate.title || candidate.host,
    iconUrl:
      normalizeIcon(iconHref, candidate.url) ||
      'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(candidate.host),
  };
}

function extractGoogleTarget(href: string): string {
  const match = href.match(/^\/url\?q=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : href;
}

async function searchBing(query: string): Promise<BrandWebsiteCandidate[]> {
  const html = await fetchHtml(
    'https://www.bing.com/search?count=10&setlang=en-US&q=' + encodeURIComponent(query),
  );
  if (!html) return [];

  const $ = cheerio.load(html);
  const results: BrandWebsiteCandidate[] = [];
  $('li.b_algo h2 a').each((_, element) => {
    const href = $(element).attr('href');
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    const normalized = href ? normalizeCandidate(href) : null;
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

async function searchGoogle(query: string): Promise<BrandWebsiteCandidate[]> {
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
    const normalized = normalizeCandidate(target);
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

async function searchDuckDuckGo(query: string): Promise<BrandWebsiteCandidate[]> {
  const html = await fetchHtml(
    'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query),
  );
  if (!html) return [];
  const $ = cheerio.load(html);
  const results: BrandWebsiteCandidate[] = [];

  $('.result__a').each((_, element) => {
    const href = $(element).attr('href');
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    const normalized = href ? normalizeCandidate(href) : null;
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

  const variants = new Set<string>();
  for (const base of [compactQuery, slug]) {
    if (!base) continue;
    for (const tld of ['com', 'org', 'net', 'co', 'app', 'io', 'ai', 'dev']) {
      variants.add('https://' + base + '.' + tld);
    }
  }
  return Array.from(variants);
}

async function discoverLikelyDomains(query: string): Promise<BrandWebsiteCandidate[]> {
  const urls = likelyDomainCandidates(query).slice(0, 16);

  const results = await Promise.all(
    urls.map(async (candidateUrl) => {
      const host = new URL(candidateUrl).hostname;
      const html = await fetchHtml(candidateUrl, 2400);
      const reachable = Boolean(html) || await probeUrl(candidateUrl, 2400);

      // Do not discard a strong exact-domain candidate just because the site
      // blocks HTML scraping. A reachable 403/429/etc. is still a valid
      // website candidate for the user to inspect/select.
      if (!reachable) return null;

      const $ = html ? cheerio.load(html) : null;
      const title = $?.('title').first().text().replace(/\s+/g, ' ').trim() || host;

      return {
        title,
        url: candidateUrl,
        host,
        iconUrl: null,
      };
    }),
  );

  return results.filter((result): result is BrandWebsiteCandidate => Boolean(result));
}

export async function discoverBrandWebsites(query: string): Promise<BrandWebsiteCandidate[]> {
  const cleaned = query.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2) return [];

  const searchQuery = cleaned + ' official website';

  const [bing, google, duckduckgo, likely] = await Promise.all([
    searchBing(searchQuery).catch(() => []),
    searchGoogle(searchQuery).catch(() => []),
    searchDuckDuckGo(searchQuery).catch(() => []),
    discoverLikelyDomains(cleaned).catch(() => []),
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

  const rankedCandidates = rankAndDedupe(ranked);
  return Promise.all(rankedCandidates.map(enrichCandidate));
}
