export type BrandWebsiteSuggestion = { title: string; url: string };

function normalizeHref(raw: string): string | null {
  try {
    const value = raw.startsWith('//') ? 'https:' + raw : raw;
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) return null;
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/';
    }
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function decodeDuckDuckGoRedirect(href: string): string | null {
  try {
    const url = new URL(href, 'https://html.duckduckgo.com');
    const encoded = url.searchParams.get('uddg');
    return encoded ? normalizeHref(decodeURIComponent(encoded)) : normalizeHref(url.toString());
  } catch {
    return null;
  }
}

export function parseSearchHtml(html: string): BrandWebsiteSuggestion[] {
  const results: BrandWebsiteSuggestion[] = [];
  const blockedHosts = new Set(['facebook.com','instagram.com','linkedin.com','x.com','twitter.com','youtube.com','wikipedia.org','crunchbase.com','bloomberg.com','reddit.com']);
  const seen = new Set<string>();
  const anchorPattern = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) && results.length < 8) {
    const url = decodeDuckDuckGoRedirect(match[1]);
    if (!url) continue;
    const cleanTitle = match[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (!cleanTitle || blockedHosts.has(host) || seen.has(host)) continue;
    seen.add(host);
    results.push({ title: host, url });
  }
  return results;
}

export async function discoverBrandWebsites(query: string): Promise<BrandWebsiteSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const endpoint = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q + ' official website');
  const response = await fetch(endpoint, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'UpTrendifyOSBrandDiscovery/1.0',
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error('Brand search provider returned HTTP ' + response.status);
  return parseSearchHtml(await response.text());
}
