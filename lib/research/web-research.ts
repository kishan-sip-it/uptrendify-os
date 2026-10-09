import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiProvider } from '@/lib/ai/types';
import { createDefaultRegistry, runWithProviderFailover } from '@/lib/ai/registry';
import { assertPublicHttpUrl, assertResolvablePublicHost, fetchPublicHttp, readBoundedBody } from './url-security';
import { extractPage } from './extract';
import { normalizeResearchUrl } from './url-policy';
import { obs } from '@/lib/obs/logger';

const MAX_SEARCH_URLS = 10;
const MAX_EXTERNAL_SOURCES = 6;
const MAX_EXTERNAL_CHARS = 4_500;

const SEARCH_URL_EXCLUSIONS = [
  /google\./i,
  /bing\.com/i,
  /duckduckgo\.com/i,
  /facebook\.com/i,
  /instagram\.com/i,
  /linkedin\.com/i,
  /twitter\.com/i,
  /x\.com/i,
  /tiktok\.com/i,
  /youtube\.com/i,
];

export type WebResearchAugmentation = {
  sourcesAdded: number;
  urls: string[];
  provider?: string;
  model?: string;
  warning?: string;
};

function extractUrls(text: string, rootUrl: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/g)) {
    const raw = match[0]?.replace(/[.,;:!?]+$/, '');
    if (!raw) continue;
    try {
      const url = assertPublicHttpUrl(raw);
      const normalized = normalizeResearchUrl(url.toString());
      if (SEARCH_URL_EXCLUSIONS.some((pattern) => pattern.test(normalized))) continue;
      // External research may legitimately be news, press, blogs or events;
      // those paths are intentionally allowed here. The first-party crawler
      // ranks them lower, but external market context should remain discoverable.
      if (normalized === normalizeResearchUrl(rootUrl)) continue;
      found.add(normalized);
    } catch {
      continue;
    }
  }
  return [...found].slice(0, MAX_SEARCH_URLS);
}

async function fetchExternalPage(url: string): Promise<{ url: string; title: string | null; text: string } | null> {
  try {
    const safe = assertPublicHttpUrl(url);
    await assertResolvablePublicHost(safe.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    let response: Response;
    try {
      response = await fetchPublicHttp(safe.toString(), {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'user-agent': 'UpTrendifyOSResearch/1.0',
          accept: 'text/html,application/xhtml+xml,text/plain',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('html') && !contentType.includes('xhtml') && !contentType.includes('text/plain')) return null;

    const bounded = await readBoundedBody(response, 900_000);
    let extracted = bounded.content;
    let title: string | null = null;
    if (contentType.includes('html') || contentType.includes('xhtml')) {
      const page = extractPage(bounded.content, safe.toString());
      title = page.title;
      extracted = page.text;
    }

    const text = extracted.replace(/\s+/g, ' ').trim().slice(0, MAX_EXTERNAL_CHARS);
    if (text.length < 220) return null;
    return {
      url: response.url || safe.toString(),
      title,
      text,
    };
  } catch {
    return null;
  }
}

export async function augmentResearchWithWebSearch(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; researchRunId: string; rootUrl: string },
  preferredProvider?: AiProvider | null,
): Promise<WebResearchAugmentation> {
  const registry = preferredProvider ? null : createDefaultRegistry();
  const configuredProviders = preferredProvider
    ? [preferredProvider]
    : (registry?.configuredInOrder() ?? []);

  // This path requires actual server-side browser search. Never fall back to a
  // provider that cannot execute web search and then trust its guessed URLs.
  const providers = configuredProviders.filter((candidate) => candidate.id === 'groq');
  if (providers.length === 0) {
    return {
      sourcesAdded: 0,
      urls: [],
      warning: 'Live web search requires the configured Groq browser-search integration; first-party website research can still continue.',
    };
  }

  const root = normalizeResearchUrl(args.rootUrl);
  const host = new URL(root).hostname.replace(/^www\./i, '');
  const prompt = [
    'Use browser search to research the public web for the organization associated with this website domain.',
    `WEBSITE DOMAIN: ${host}`,
    '',
    'Find a diverse, high-signal set of public pages that can improve brand research:',
    '- official company/product/about/pricing pages not already obvious from the homepage',
    '- credible industry or organization profiles',
    '- recent reputable news or announcements',
    '- customer/review/community pages when relevant',
    '- competitor/category pages when useful for positioning and SEO',
    '',
    'Return ONLY absolute http/https URLs, one URL per line, with no markdown and no commentary.',
    'Do not return search-engine pages, social profile pages, login pages, downloads, or unrelated results.',
  ].join('\n');

  try {
    const searched = await runWithProviderFailover(
      providers,
      (candidate) => candidate.generate({
        prompt,
        system: 'You are a web research navigator. Search first, then return only real URLs discovered in the public web results. Never invent URLs.',
        model: candidate.id === 'groq' ? 'openai/gpt-oss-120b' : candidate.defaultModel,
        maxTokens: 900,
        temperature: 0.1,
        webSearch: candidate.id === 'groq',
      }),
    );

    const urls = extractUrls(searched.result.text, root);
    if (!urls.length) {
      return {
        sourcesAdded: 0,
        urls: [],
        provider: searched.provider.id,
        model: searched.result.model,
        warning: 'Web search completed but returned no usable public URLs; first-party research was preserved.',
      };
    }

    const pages = (await Promise.all(urls.map(fetchExternalPage))).filter(
      (page): page is { url: string; title: string | null; text: string } => Boolean(page),
    ).slice(0, MAX_EXTERNAL_SOURCES);

    let added = 0;
    for (const page of pages) {
      const source = await supabase.from('brand_sources').upsert({
        organization_id: args.organizationId,
        brand_id: args.brandId,
        url: page.url,
        canonical_url: page.url,
        title: page.title,
        content_type: 'text/html',
        status: 'ACTIVE',
        http_status: 200,
        retrieved_at: new Date().toISOString(),
        content_hash: null,
        extracted_text: page.text,
        metadata: {
          research_external: true,
          research_run_id: args.researchRunId,
          discovery_provider: searched.provider.id,
          discovery_model: searched.result.model,
        },
      }, { onConflict: 'brand_id,canonical_url' }).select('id').single();

      if (source.error || !source.data) {
        obs.warn('External research source could not be persisted', {
          researchRunId: args.researchRunId,
          url: page.url,
          error: source.error?.message,
        });
        continue;
      }

      const link = await supabase.from('research_sources').upsert({
        research_run_id: args.researchRunId,
        organization_id: args.organizationId,
        source_id: source.data.id,
        status: 'PROCESSED',
      }, { onConflict: 'research_run_id,source_id' });

      if (link.error) {
        obs.warn('External research source could not be linked', {
          researchRunId: args.researchRunId,
          url: page.url,
          error: link.error.message,
        });
        continue;
      }
      added += 1;
    }

    return {
      sourcesAdded: added,
      urls: pages.map((page) => page.url),
      provider: searched.provider.id,
      model: searched.result.model,
    };
  } catch (error) {
    return {
      sourcesAdded: 0,
      urls: [],
      warning: error instanceof Error
        ? `Web search was unavailable; first-party research was preserved: ${error.message}`
        : 'Web search was unavailable; first-party research was preserved.',
    };
  }
}
