import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { obs } from '@/lib/obs/logger';
import { assertPublicHttpUrl, assertResolvablePublicHost, fetchPublicHttp, readBoundedBody } from './url-security';
import { extractPage } from './extract';

export const RESEARCH_TERMINAL_STATUSES = ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'] as const;
export const RESEARCH_ACTIVE_STATUSES = ['QUEUED', 'RUNNING'] as const;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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
};

export type CrawlArgs = {
  organizationId: string;
  brandId: string;
  websiteUrl: string;
  researchRunId: string;
};

function normalizeUrl(raw: string) {
  const url = assertPublicHttpUrl(raw);
  url.hash = '';
  url.pathname = url.pathname || '/';
  return url.toString();
}

function sameOrigin(a: string, b: string) {
  return new URL(a).origin === new URL(b).origin;
}

async function recordPageFailure(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; researchRunId: string; url: string; message: string },
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
        http_status: 0,
        retrieved_at: new Date().toISOString(),
        content_hash: null,
        extracted_text: '',
        metadata: { error: args.message },
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
          error_message: args.message.slice(0, 400),
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
  const root = normalizeUrl(websiteUrl);
  const rootHost = new URL(root).hostname;
  await assertResolvablePublicHost(rootHost);

  await supabase.from('research_runs').update({ status: 'RUNNING', started_at: new Date().toISOString(), error_code: null, error_message: null }).eq('id', researchRunId);

  const queue = [root];
  const seen = new Set<string>();
  const crawlBudget = Math.min(e.RESEARCH_TOTAL_BUDGET_MS, e.RESEARCH_TIMEOUT_MS * (e.MAX_RESEARCH_PAGES + 1));
  const start = Date.now();
  let pagesProcessed = 0;
  let pagesDiscovered = 0;
  let partial = false;
  const processedPages: ProcessedPage[] = [];

  try {
    while (queue.length && pagesProcessed < e.MAX_RESEARCH_PAGES) {
      if (Date.now() - start > crawlBudget) { partial = true; break; }

      const target = normalizeUrl(queue.shift()!);
      if (seen.has(target)) continue;
      seen.add(target);

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
            if (sameOrigin(root, redirected)) {
              await assertResolvablePublicHost(new URL(redirected).hostname);
              queue.unshift(redirected);
            }
          }
          continue;
        }

        if (!response.ok) { partial = true; await recordPageFailure(supabase, { organizationId, brandId, researchRunId, url: target, message: `HTTP ${response.status}` }); continue; }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) { partial = true; await recordPageFailure(supabase, { organizationId, brandId, researchRunId, url: target, message: 'Not an HTML page' }); continue; }

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > e.MAX_RESEARCH_BYTES) { partial = true; continue; }

        const { content, truncated } = await readBoundedBody(response, e.MAX_RESEARCH_BYTES);
        if (truncated) { partial = true; }

        const extracted = extractPage(content, target);
        let canonical = target;
        if (extracted.canonicalUrl) {
          try {
            const candidateCanonical = normalizeUrl(new URL(extracted.canonicalUrl, target).toString());
            if (sameOrigin(root, candidateCanonical)) canonical = candidateCanonical;
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
            if (sameOrigin(root, candidate) && !seen.has(candidate) && queue.length + seen.size < e.MAX_RESEARCH_PAGES * 3) queue.push(candidate);
          } catch {
            continue;
          }
        }
      } catch (error) {
        partial = true;
        pagesDiscovered = seen.size;
        obs.warn('Research page failed', { brandId, url: target, error: error instanceof Error ? error.message : String(error) });
        await recordPageFailure(supabase, { organizationId, brandId, researchRunId, url: target, message: error instanceof Error ? error.message : String(error) });
      }

      const progress = await supabase.from('research_runs').update({ pages_processed: pagesProcessed, pages_discovered: seen.size }).eq('id', researchRunId);
      if (progress.error) obs.warn('Failed to persist research progress', { researchRunId, error: progress.error.message });
    }

    const finalStatus = pagesProcessed > 0 ? (partial ? 'PARTIAL' : 'COMPLETED') : 'FAILED';
    const result = await supabase.from('research_runs').update({
      status: finalStatus,
      pages_processed: pagesProcessed,
      pages_discovered: seen.size,
      finished_at: new Date().toISOString(),
      error_code: finalStatus === 'FAILED' ? 'NO_PAGES_PROCESSED' : partial ? 'PARTIAL' : null,
      error_message: finalStatus === 'FAILED'
        ? 'No pages could be processed during this research run.'
        : partial
          ? 'Some pages could not be processed; review source status.'
          : null,
    }).eq('id', researchRunId);
    if (result.error) throw result.error;

    obs.info('Research crawl finished', { researchRunId, brandId, status: finalStatus, pagesProcessed, pagesDiscovered: seen.size });

    return { status: finalStatus, pagesProcessed, pagesDiscovered: seen.size, processedPages };
  } catch (error) {
    const failed = await supabase.from('research_runs').update({
      status: 'FAILED',
      finished_at: new Date().toISOString(),
      error_code: 'RESEARCH_FAILED',
      error_message: error instanceof Error ? error.message : 'Research failed',
    }).eq('id', researchRunId);
    if (failed.error) obs.error('Failed to mark research run as failed', { researchRunId, error: failed.error.message });
    throw error;
  }
}