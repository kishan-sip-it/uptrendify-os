import * as cheerio from 'cheerio';

export type ExtractedPage = {
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  headings: string[];
  text: string;
  links: string[];
};

export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  $('script, style, noscript, template, svg').remove();
  const title = $('title').first().text().trim() || null;
  const description = $('meta[name="description"]').attr('content')?.trim() || null;
  const canonicalUrl = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const headings = $('h1,h2,h3').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean).slice(0, 80);
  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 50_000);
  const links = $('a[href]').map((_, el) => {
    try { return new URL($(el).attr('href')!, baseUrl).toString(); } catch { return null; }
  }).get().filter((v): v is string => Boolean(v)).slice(0, 100);
  return { title, description, canonicalUrl, headings, text, links };
}
