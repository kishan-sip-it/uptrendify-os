import { createSupabaseServerClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { assertPublicHttpUrl, assertResolvablePublicHost } from './url-security';
import { extractPage } from './extract';

function normalizeUrl(raw: string) {
  const url = assertPublicHttpUrl(raw);
  url.hash = '';
  url.pathname = url.pathname || '/';
  return url.toString();
}

function sameOrigin(a: string, b: string) {
  return new URL(a).origin === new URL(b).origin;
}

export async function researchBrand(organizationId: string, brandId: string, websiteUrl: string, researchRunId: string) {
  const e = env();
  const supabase = await createSupabaseServerClient();
  const root = normalizeUrl(websiteUrl);
  const rootHost = new URL(root).hostname;
  await assertResolvablePublicHost(rootHost);

  await supabase.from('research_runs').update({ status: 'RUNNING', started_at: new Date().toISOString() }).eq('id', researchRunId);

  const queue = [root];
  const seen = new Set<string>();
  let pagesProcessed = 0;
  let partial = false;

  while (queue.length && pagesProcessed < e.MAX_RESEARCH_PAGES) {
    const target = normalizeUrl(queue.shift()!);
    if (seen.has(target)) continue;
    seen.add(target);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), e.RESEARCH_TIMEOUT_MS);
      const response = await fetch(target, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'user-agent': e.RESEARCH_USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      });
      clearTimeout(timeout);

      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get('location');
        if (location && seen.size < e.MAX_RESEARCH_PAGES) {
          const redirected = normalizeUrl(new URL(location, target).toString());
          if (sameOrigin(root, redirected)) {
            await assertResolvablePublicHost(new URL(redirected).hostname);
            queue.unshift(redirected);
          }
        }
        continue;
      }

      if (!response.ok) { partial = true; continue; }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) { partial = true; continue; }

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > e.MAX_RESEARCH_BYTES) { partial = true; continue; }
      const html = await response.text();
      if (Buffer.byteLength(html, 'utf8') > e.MAX_RESEARCH_BYTES) { partial = true; continue; }

      const extracted = extractPage(html, target);
      const canonical = extracted.canonicalUrl ? new URL(extracted.canonicalUrl, target).toString() : target;
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

      await supabase.from('research_sources').upsert({ research_run_id: researchRunId, organization_id: organizationId, source_id: source.data.id, status: 'PROCESSED' }, { onConflict: 'research_run_id,source_id' });

      pagesProcessed += 1;
      for (const link of extracted.links) {
        if (sameOrigin(root, link) && !seen.has(normalizeUrl(link)) && queue.length + seen.size < e.MAX_RESEARCH_PAGES * 3) queue.push(link);
      }
    } catch {
      partial = true;
    }

    await supabase.from('research_runs').update({ pages_processed: pagesProcessed, pages_discovered: seen.size }).eq('id', researchRunId);
  }

  const finalStatus = pagesProcessed > 0 ? (partial ? 'PARTIAL' : 'COMPLETED') : 'FAILED';
  await supabase.from('research_runs').update({ status: finalStatus, pages_processed: pagesProcessed, pages_discovered: seen.size, finished_at: new Date().toISOString(), error_message: partial ? 'Some pages could not be processed; review source status.' : null }).eq('id', researchRunId);
  return { status: finalStatus, pagesProcessed, pagesDiscovered: seen.size };
}
