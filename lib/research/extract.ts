import * as cheerio from 'cheerio';

export type ExtractedPage = {
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  headings: string[];
  text: string;
  links: string[];
  redirectHints: string[];
};

function extractRedirectHints($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const hints: string[] = [];
  $('meta[http-equiv="refresh"]').each((_, el) => {
    const content = $(el).attr('content') ?? '';
    const match = content.match(/url=([^;]+)$/i);
    if (!match?.[1]) return;
    try { hints.push(new URL(match[1].trim().replace(/^['\"]|['\"]$/g, ''), baseUrl).toString()); } catch {}
  });
  $('script').each((_, el) => {
    const script = $(el).html() ?? '';
    const patterns = [
      /(?:location\\.(?:href|assign|replace)|window\\.location\\.(?:href|assign|replace))\\s*\\(?\\s*['\"]([^'\"]+)['\"]/gi,
      /(?:router\\.(?:push|replace)|navigate)\\s*\\(\\s*['\"]([^'\"]+)['\"]/gi,
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(script)) && hints.length < 20) {
        try { hints.push(new URL(match[1], baseUrl).toString()); } catch {}
      }
    }
  });
  return [...new Set(hints)].slice(0, 20);
}

function extractEmbeddedData($: cheerio.CheerioAPI): string {
  const chunks: string[] = [];
  $('script[type="application/ld+json"], script#__NEXT_DATA__, script[type="application/json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (raw) chunks.push(raw);
  });
  return chunks.join(' ').replace(/\s+/g, ' ').slice(0, 20_000);
}

export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  const embeddedData = extractEmbeddedData($);
  const redirectHints = extractRedirectHints($, baseUrl);
  const title = $('title').first().text().trim() || null;
  const description = $('meta[name="description"]').attr('content')?.trim() || null;
  const canonicalUrl = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const headings = $('h1,h2,h3').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean).slice(0, 80);
  $('script, style, noscript, template, svg').remove();
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
  const textSource = visibleText.length >= 240 ? visibleText : [visibleText, embeddedData].filter(Boolean).join(' ');
  const text = textSource.slice(0, 50_000);
  const links = $('a[href]').map((_, el) => {
    try { return new URL($(el).attr('href')!, baseUrl).toString(); } catch { return null; }
  }).get().filter((v): v is string => Boolean(v)).slice(0, 100);
  return { title, description, canonicalUrl, headings, text, links, redirectHints };
}