import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { obs } from '@/lib/obs/logger';
import { assertPublicHttpUrl, assertResolvablePublicHost, fetchPublicHttp, readBoundedBody } from './url-security';
import { translateResearchError } from './errors';
import { extractPage } from './extract';
import { isLikelyAuthGatedContent, isLowSignalResearchPath, isResearchCandidate, normalizeResearchUrl, sameResearchSite } from './url-policy';

export { sameResearchSite } from './url-policy';

export const RESEARCH_TERMINAL_STATUSES = ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'] as const;
export const RESEARCH_ACTIVE_STATUSES = ['QUEUED', 'RUNNING'] as const;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HIGH_SIGNAL_PATHS = [
  /(^|\\/)about(?:-us)?(?:\\/|$)/i,
  /(^|\\/)mission(?:s)?(?:\\/|$)/i,
  /(^|\\/)science(?:\\/|$)/i,
  /(^|\\/)research(?:\\/|$)/i,
  /(^|\\/)technology(?:\\/|$)/i,
  /(^|\\/)products?(?:\\/|$)/i,
  /(^|\\/)services?(?:\\/|$)/i,
  /(^|\\/)solutions?(?:\\/|$)/i,
  /(^|\\/)programs?(?:\\/|$)/i,
  /(^|\\/)features?(?:\\/|$)/i,
  /(^|\\/)use-cases?(?:\\/|$)/i,
  /(^|\\/)customers?(?:\\/|$)/i,
  /(^|\\/)industr(?:y|ies)(?:\\/|$)/i,
  /(^|\\/)learn(?:ing)?(?:-resources)?(?:\\/|$)/i,
  /(^|\\/)education(?:\\/|$)/i,
  /(^|\\/)pricing(?:\\/|$)/i,
  /(^|\\/)solutions?\\//i,
];

const LOW_SIGNAL_PATHS = [
  /(^|\\/)news(?:\\/|$)/i,
  /(^|\\/)press(?:-releases?)?(?:\\/|$)/i,
  /(^|\\/)blog(?:s)?(?:\\/|$)/i,
  /(^|\\/)podcasts?(?:\\/|$)/i,
  /(^|\\/)social(?:-media)?(?:\\/|$)/i,
  /(^|\\/)events?(?:\\/|$)/i,
  /(^|\\/)multimedia(?:\\/|$)/i,
  /(^|\\/)newsletter(?:s)?(?:\\/|$)/i,
  /(^|\\/)media(?:\\/|$)/i,
  /(^|\\/)contact(?:-us)?(?:\\/|$)/i,
];

export function researchPagePriority(root: string, rawUrl: string): number {
  try {
    const rootUrl = new URL(root);
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/\\/$/, '') || '/';
    const host = url.hostname.toLowerCase().replace(/^www\\./, '');
    const rootHost = rootUrl.hostname.toLowerCase().replace(/^www\\./, '');

    let score = 0;
    if (host === rootHost) score += 12;
    else score += 8; // trusted same-site subdomains can carry major product/science content

    if (path === '/') score += 100;
    if (HIGH_SIGNAL_PATHS.some((pattern) => pattern.test(path))) score += 70;
    if (LOW_SIGNAL_PATHS.some((pattern) => pattern.test(path))) score -= 50;

    const segments = path.split('/').filter(Boolean);
    score -= Math.min(segments.length, 5) * 3;
    if (/\\.(?:pdf|zip|png|jpe?g|gif|svg|webp|xml)$/i.test(path)) score -= 100;

    return score;
  } catch {
    return -100;
  }
}

async function discoverSitemapUrls(root: string): Promise<string[]> {
  const rootUrl = new URL(root);
  const candidates = [
    new URL('/sitemap.xml', rootUrl).toString(),
    new URL('/sitemap_index.xml', rootUrl).toString(),
  ];
  const discovered: string[] = [];
  const timeoutMs = Math.min(env().RESEARCH_TIMEOUT_MS, 5_000);

  for (const sitemap of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchPublicHttp(sitemap, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': env().RESEARCH_USER_AGENT, accept: 'application/xml,text/xml,text/plain' },
      });
      if (!response.ok) continue;
      const body = (await response.text()).slice(0, 2_000_000);
      const locs = [...body.matchAll(/<loc>\\s*([^<]+)\\s*<\\/loc>/gi)]
        .map((match) => match[1]?.trim())
        .filter((value): value is string => Boolean(value));

      for (const raw of locs) {
        try {
          const normalized = normalizeUrl(raw);
          if (isResearchCandidate(root, normalized)) discovered.push(normalized);
        } catch {
          continue;
        }
      }
      if (discovered.length > 0) break;
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  return [...new Set(discovered)]
    .sort((a, b) => researchPagePriority(root, b) - researchPagePriority(root, a))
    .slice(0, 80);
}


async function fetchRenderedFallback(target: string): Promise<{ text: string; title: string | null } | null> {
  const key = env().JINA_API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(env().RESEARCH_TIMEOUT_MS * 2, 20_000));
  try {
    const response = await fetch('https://r.jina.ai/' + target, {
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
    return { text: text.slice(0, 50_000), title };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function shouldUseRenderedFallback(html: string, extractedText: string, extractedLinks: string[]): boolean {
  if (extractedText.length >= 320) return false;
  if (html.length < 400) return false;
  return extractedLinks.length === 0 ||
    /(__next|__nuxt|reactroot|vite|webpack|data-reactroot)/i.test(html);
}

export type ProcessedPage = {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string | null;
  text: string;
};

export type CrawlOutcome = {
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  pagesProcessed: number;
  pagesDiscovered: number;
  processedPages: ProcessedPage[];
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type CrawlArgs = {
  organizationId: string;
  brandId: string;
  websiteUrl: string;
  researchRunId: string;
};

function normalizeUrl(raw: string) {
  return normalizeResearchUrl(raw);
}

async function recordPageFailure(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; researchRunId: string; url: string; code: string; message: string; httpStatus?: number },
): Promise<void> {
  try {
    const canonical = args.url;
    const source = await supabase
      .from('brand_sources')
      .upsert({
        organization_id: args.organizationId,
        brand_id: args.brandId,
        url: canonical,
        canonical_url: canonical,
        title: null,
        content_type: 'text/html',
        status: 'FAILED',
        http_status: args.httpStatus ?? 0,
        retrieved_at: new Date().toISOString(),
        content_hash: null,
        extracted_text: '',
        metadata: { error_code: args.code, error: args.message },
      }, { onConflict: 'brand_id,canonical_url' })
      .select('id')
      .single();
    if (source.error || !source.data) return;
    await supabase
      .from('research_sources')
      .upsert(
        {
          research_run_id: args.researchRunId,
          organization_id: args.organizationId,
          source_id: source.data.id,
          status: 'FAILED',
          error_message: `[${args.code}] ${args.message}`.slice(0, 400),
        },
        { onConflict: 'research_run_id,source_id' },
      );
  } catch (error) {
    obs.warn('Failed to record page failure', { url: args.url, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function crawlBrand(supabase: SupabaseClient, args: CrawlArgs): Promise<CrawlOutcome> {
  const { organizationId, brandId, websiteUrl, researchRunId } = args;
  const e = env();

  // Mark the run as started before any network preflight so an early DNS/URL
  // failure cannot leave the user staring at a permanently queued run.
  const startedAt = new Date().toISOString();
  const started = await supabase
    .from('research_runs')
    .update({ status: 'RUNNING', started_at: startedAt, error_code: null, error_message: null })
    .eq('id', researchRunId);
  if (started.error) throw started.error;

  let root: string;
  let rootHost: string;
  try {
    root = normalizeUrl(websiteUrl);
    rootHost = new URL(root).hostname;
    await assertResolvablePublicHost(rootHost);
  } catch (error) {
    const info = translateResearchError(error);
    await supabase
      .from('research_runs')
      .update({
        status: 'FAILED',
        finished_at: new Date().toISOString(),
        error_code: info.code,
        error_message: info.message.slice(0, 600),
      })
      .eq('id', researchRunId);
    throw error;
  }

  const queue: Array<{ url: string; priority: number }> = [{ url: root, priority: 1000 }];
  const seen = new Set<string>();
  const sitemapCandidates = await discoverSitemapUrls(root);
  for (const candidate of sitemapCandidates) {
    if (!seen.has(candidate) && queue.length < e.MAX_RESEARCH_PAGES * 5) {
      queue.push({ url: candidate, priority: researchPagePriority(root, candidate) });
    }
  }

  const crawlBudget = Math.min(e.RESEARCH_TOTAL_BUDGET_MS, e.RESEARCH_TIMEOUT_MS * (e.MAX_RESEARCH_PAGES + 1));
  const start = Date.now();
  let pagesProcessed = 0;
  let pagesDiscovered = 0;
  let partial = false;
  let runFailureCode: string | null = null;
  let runFailureMessage: string | null = null;
  const processedPages: ProcessedPage[] = [];

  try {
    while (queue.length && pagesProcessed < e.MAX_RESEARCH_PAGES) {
      if (Date.now() - start > crawlBudget) { partial = true; break; }

      queue.sort((a, b) => b.priority - a.priority);
      const nextItem = queue.shift();
      if (!nextItem) break;
      const target = normalizeUrl(nextItem.url);
      if (!isResearchCandidate(root, target)) continue;
      if (seen.has(target)) continue;
      seen.add(target);
      const recordRunFailure = (code: string, message: string) => {
        if (target === root || runFailureCode === null) {
          runFailureCode = code;
          runFailureMessage = message;
        }
      };

      try {
        const host = new URL(target).hostname;
        await assertResolvablePublicHost(host);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), e.RESEARCH_TIMEOUT_MS);
        let response: Response;
        try {
          response = await fetchPublicHttp(target, {
            signal: controller.signal,
            redirect: 'manual',
            headers: { 'user-agent': e.RESEARCH_USER_AGENT, accept: 'text/html,application/xhtml+xml' },
          });
        } finally {
          clearTimeout(timeout);
        }

        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers.get('location');
          const redirectCount = Number(response.headers.get('x-redirect-count') || 0) + 1;
          if (location && redirectCount <= e.MAX_RESEARCH_REDIRECTS && seen.size < e.MAX_RESEARCH_PAGES * 3) {
            const redirected = normalizeUrl(new URL(location, target).toString());
            if (isResearchCandidate(root, redirected)) {
              await assertResolvablePublicHost(new URL(redirected).hostname);
              queue.push({ url: redirected, priority: researchPagePriority(root, redirected) + 5 });
            } else if (isLowSignalResearchPath(redirected)) {
              partial = true;
              recordRunFailure('AUTH_REQUIRED', 'The public website redirects research to a login or account page.');
            }
          }
          continue;
        }

        if (!response.ok) {
          partial = true;
          recordRunFailure(`HTTP_${response.status}`, `HTTP ${response.status}`);
          await recordPageFailure(supabase, { organizationId, brandId, researchRunId, url: target, code: `HTTP_${response.status}`, message: `HTTP ${response.status}`, httpStatus: response.status });
          continue;
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
          partial = true;
          recordRunFailure('NOT_HTML', 'Not an HTML page');
          await recordPageFailure(supabase, { organizationId, brandId, researchRunId, url: target, code: 'NOT_HTML', message: 'Not an HTML page', httpStatus: response.status });
          continue;
        }

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > e.MAX_RESEARCH_BYTES) {
          partial = true;
          recordRunFailure('CONTENT_TOO_LARGE', `Content exceeds ${e.MAX_RESEARCH_BYTES} bytes`);
          await recordPageFailure(supabase, { organizationId, brandId, researchRunId, url: target, code: 'CONTENT_TOO_LARGE', message: `Content exceeds ${e.MAX_RESEARCH_BYTES} bytes`, httpStatus: response.status });
          continue;
        }

        const { content, truncated } = await readBoundedBody(response, e.MAX_RESEARCH_BYTES);
        if (truncated) { partial = true; }

        let extracted = extractPage(content, target);

        // Raw HTML is often only an app shell for JS-rendered sites. When the
        // extracted document is too thin, use Jina Reader's free browser-backed
        // renderer as a fallback instead of declaring the website unusable.
        if (isLikelyAuthGatedContent(extracted.title, extracted.text)) {
          partial = true;
          recordRunFailure(
            'AUTH_REQUIRED',
            'The public website requires a login or blocks automated public access, so no trustworthy evidence was extracted from this page.',
          );
          await recordPageFailure(supabase, {
            organizationId,
            brandId,
            researchRunId,
            url: target,
            code: 'AUTH_REQUIRED',
            message: 'The public website requires a login or blocks automated public access.',
            httpStatus: response.status,
          });
          continue;
        }

        if (shouldUseRenderedFallback(content, extracted.text, extracted.links)) {
          const rendered = await fetchRenderedFallback(target);
          if (rendered && rendered.text.length > extracted.text.length) {
            extracted = {
              ...extracted,
              title: rendered.title ?? extracted.title,
              text: rendered.text,
            };
            obs.info('Used rendered research fallback', { researchRunId, brandId, url: target });
          }
        }

        let canonical = target;
        if (extracted.canonicalUrl) {
          try {
            const candidateCanonical = normalizeUrl(new URL(extracted.canonicalUrl, target).toString());
            if (isResearchCandidate(root, candidateCanonical)) canonical = candidateCanonical;
          } catch {
            canonical = target;
          }
        }
        const contentHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(extracted.text)).then(buf => Buffer.from(buf).toString('hex'));

        const source = await supabase.from('brand_sources').upsert({
          organization_id: organizationId,
          brand_id: brandId,
          url: target,
          canonical_url: canonical,
          title: extracted.title,
          content_type: contentType,
          status: 'ACTIVE',
          http_status: response.status,
          retrieved_at: new Date().toISOString(),
          content_hash: contentHash,
          extracted_text: extracted.text,
          metadata: { description: extracted.description, headings: extracted.headings },
        }, { onConflict: 'brand_id,canonical_url' }).select('id').single();
        if (source.error) throw source.error;

        const link = await supabase.from('research_sources').upsert({ research_run_id: researchRunId, organization_id: organizationId, source_id: source.data.id, status: 'PROCESSED' }, { onConflict: 'research_run_id,source_id' });
        if (link.error) throw link.error;

        processedPages.push({ id: source.data.id, url: target, canonicalUrl: canonical, title: extracted.title, text: extracted.text });
        pagesDiscovered = seen.size;
        pagesProcessed += 1;
        for (const next of extracted.links) {
          try {
            const candidate = normalizeUrl(next);
            if (isResearchCandidate(root, candidate) && !seen.has(candidate) && queue.length + seen.size < e.MAX_RESEARCH_PAGES * 5) {
              queue.push({ url: candidate, priority: researchPagePriority(root, candidate) });
            }
          } catch {
            continue;
          }
        }
      } catch (error) {
        partial = true;
        pagesDiscovered = seen.size;
        const info = translateResearchError(error);
        recordRunFailure(info.code, info.message);
        obs.warn('Research page failed', { brandId, url: target, error: info.message, errorCode: info.code });
        await recordPageFailure(supabase, { organizationId, brandId, researchRunId, url: target, code: info.code, message: info.message });
      }

      const progress = await supabase.from('research_runs').update({ pages_processed: pagesProcessed, pages_discovered: seen.size }).eq('id', researchRunId);
      if (progress.error) obs.warn('Failed to persist research progress', { researchRunId, error: progress.error.message });
    }

    const crawlStatus = pagesProcessed > 0 ? (partial ? 'PARTIAL' : 'COMPLETED') : 'FAILED';

    obs.info('Research crawl finished', { researchRunId, brandId, status: crawlStatus, pagesProcessed, pagesDiscovered: seen.size });

    // Pipeline owns terminal research-run finalization so Brand Brain generation
    // cannot finish after the UI already sees a terminal crawl status.
    return {
      status: crawlStatus,
      pagesProcessed,
      pagesDiscovered: seen.size,
      processedPages,
      errorCode: runFailureCode,
      errorMessage: runFailureMessage,
    };
  } catch (error) {
    const info = translateResearchError(error);
    const failed = await supabase.from('research_runs').update({
      status: 'FAILED',
      finished_at: new Date().toISOString(),
      error_code: info.code === 'RESEARCH_FAILED' ? 'RESEARCH_FAILED' : info.code,
      error_message: info.message,
    }).eq('id', researchRunId);
    if (failed.error) obs.error('Failed to mark research run as failed', { researchRunId, error: failed.error.message });
    throw error;
  }
}