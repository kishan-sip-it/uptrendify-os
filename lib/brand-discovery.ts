import * as cheerio from 'cheerio';

export type BrandWebsiteCandidate = {
  title: string;
  url: string;
  host: string;
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
  }).slice(0, 5);
}

async function searchBing(query: string): Promise<BrandWebsiteCandidate[]> {
  const response = await fetch(
    'https://www.bing.com/search?count=8&setlang=en-US&q=' + encodeURIComponent(query),
    { headers: { 'user-agent': 'Mozilla/5.0 (UpTrendifyOS brand discovery)' }, cache: 'no-store' },
  );
  if (!response.ok) return [];
  const $ = cheerio.load(await response.text());
  const results: BrandWebsiteCandidate[] = [];
  $('li.b_algo h2 a').each((_, element) => {
    const href = $(element).attr('href');
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    const normalized = href ? normalizeCandidate(href) : null;
    if (normalized && title) {
      results.push({ title, url: normalized, host: new URL(normalized).hostname });
    }
  });
  return dedupe(results);
}

async function searchGoogle(query: string): Promise<BrandWebsiteCandidate[]> {
  const response = await fetch(
    'https://www.google.com/search?hl=en&num=8&q=' + encodeURIComponent(query),
    { headers: { 'user-agent': 'Mozilla/5.0 (UpTrendifyOS brand discovery)' }, cache: 'no-store' },
  );
  if (!response.ok) return [];
  const $ = cheerio.load(await response.text());
  const results: BrandWebsiteCandidate[] = [];
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href') || '';
    const title = $(element).find('h3').first().text().trim();
    let target = href;
    const match = href.match(/^\/url\?q=([^&]+)/);
    if (match) target = decodeURIComponent(match[1]);
    const normalized = normalizeCandidate(target);
    if (normalized && title) {
      results.push({ title, url: normalized, host: new URL(normalized).hostname });
    }
  });
  return dedupe(results);
}

export async function discoverBrandWebsites(query: string): Promise<BrandWebsiteCandidate[]> {
  const cleaned = query.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2) return [];
  const searchQuery = cleaned + ' official website';
  const bing = await searchBing(searchQuery).catch(() => []);
  if (bing.length) return bing;
  return searchGoogle(searchQuery).catch(() => []);
}
