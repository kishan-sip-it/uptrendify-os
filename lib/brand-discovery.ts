import * as cheerio from 'cheerio';

export type BrandWebsiteCandidate = {
  title: string;
  url: string;
  host: string;
  iconUrl: string | null;
};

const BLOCKED_HOSTS = new Set([
  'google.com','www.google.com','bing.com','www.bing.com','search.brave.com',
  'youtube.com','www.youtube.com','facebook.com','www.facebook.com',
  'instagram.com','www.instagram.com','linkedin.com','www.linkedin.com',
  'x.com','www.x.com','tiktok.com','www.tiktok.com',
]);

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

function dedupe(candidates: BrandWebsiteCandidate[]): BrandWebsiteCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.host.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

async function fetchHtml(url: string, timeoutMs = 4500): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (UpTrendifyOS brand discovery)' },
      cache: 'no-store',
    });
    if (!response.ok) return '';
    return await response.text();
  } catch {
    return '';
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
  const html = await fetchHtml(candidate.url, 3500);
  if (!html) {
    return {
      ...candidate,
      iconUrl: 'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(candidate.host),
    };
  }

  const $ = cheerio.load(html);
  const iconHref =
    $('link[rel~="icon"][href]').first().attr('href') ||
    $('link[rel~="shortcut"][rel~="icon"][href]').first().attr('href') ||
    $('link[rel~="apple-touch-icon"][href]').first().attr('href') ||
    $('meta[property="og:image"][content]').first().attr('content');

  return {
    ...candidate,
    iconUrl:
      normalizeIcon(iconHref, candidate.url) ||
      'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(candidate.host),
  };
}

function extractGoogleTarget(href: string): string {
  const match = href.match(/^\/url\?q=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : href;
}

function rawCandidatesFromSearch(
  html: string,
  selector: string,
  titleSelector: (element: cheerio.Element) => string,
  hrefSelector: (element: cheerio.Element) => string | undefined,
): BrandWebsiteCandidate[] {
  const $ = cheerio.load(html);
  const results: BrandWebsiteCandidate[] = [];
  $(selector).each((_, element) => {
    const href = hrefSelector(element);
    const title = titleSelector(element).replace(/\s+/g, ' ').trim();
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
  return dedupe(results);
}

async function searchBing(query: string): Promise<BrandWebsiteCandidate[]> {
  const html = await fetchHtml(
    'https://www.bing.com/search?count=10&setlang=en-US&q=' + encodeURIComponent(query),
  );
  return html
    ? rawCandidatesFromSearch(
        html,
        'li.b_algo h2 a',
        (element) => cheerio.load(element).text(),
        (element) => cheerio.load(element).attr('href'),
      )
    : [];
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

  return dedupe(results);
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

  return dedupe(results);
}

function likelyDomainCandidates(query: string): string[] {
  const compact = query.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!compact && !slug) return [];

  const variants = new Set<string>();
  for (const base of [compact, slug]) {
    if (!base) continue;
    for (const tld of ['com', 'app', 'io', 'co', 'ai']) {
      variants.add('https://' + base + '.' + tld);
    }
  }
  return Array.from(variants);
}

async function discoverLikelyDomains(query: string): Promise<BrandWebsiteCandidate[]> {
  const results: BrandWebsiteCandidate[] = [];
  for (const candidateUrl of likelyDomainCandidates(query).slice(0, 10)) {
    const html = await fetchHtml(candidateUrl, 2600);
    if (!html) continue;
    const $ = cheerio.load(html);
    const title = $('title').first().text().replace(/\s+/g, ' ').trim() || new URL(candidateUrl).hostname;
    results.push(await enrichCandidate({
      title,
      url: candidateUrl,
      host: new URL(candidateUrl).hostname,
    }));
    if (results.length >= 5) break;
  }
  return dedupe(results);
}

export async function discoverBrandWebsites(query: string): Promise<BrandWebsiteCandidate[]> {
  const cleaned = query.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2) return [];

  const searchQuery = cleaned + ' official website';
  for (const searcher of [searchBing, searchGoogle, searchDuckDuckGo]) {
    const candidates = await searcher(searchQuery).catch(() => []);
    if (candidates.length > 0) {
      return Promise.all(candidates.map(enrichCandidate));
    }
  }

  return discoverLikelyDomains(cleaned);
}
