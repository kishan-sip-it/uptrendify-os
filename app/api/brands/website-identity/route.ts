import { NextResponse } from 'next/server';
import { requireOrgRole, CAN_VIEW_DASHBOARD } from '@/lib/auth/roles';
import { env } from '@/lib/env';
import { assertPublicHttpUrl, assertResolvablePublicHost, fetchPublicHttp, readBoundedBody } from '@/lib/research/url-security';
import { extractBrandIdentity } from '@/lib/brand/visual-extraction';

export const maxDuration = 20;

function sameSite(a: string, b: string): boolean {
  const host = (value: string) => new URL(value).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const hostA = host(a);
  const hostB = host(b);
  return hostA === hostB || hostA.endsWith('.' + hostB) || hostB.endsWith('.' + hostA);
}

type FetchOutcome =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: string; finalUrl: string | null };

async function fetchSiteHtml(root: URL): Promise<FetchOutcome> {
  let target = root.toString();
  let finalUrl: string | null = null;

  for (let redirects = 0; redirects <= Math.min(env().MAX_RESEARCH_REDIRECTS, 3); redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(env().RESEARCH_TIMEOUT_MS, 6000));
    try {
      const response = await fetchPublicHttp(target, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'user-agent': env().RESEARCH_USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location || redirects >= 3) break;
        let next: URL;
        try {
          next = assertPublicHttpUrl(new URL(location, target).toString());
        } catch {
          break;
        }
        // Refuse to follow a redirect off the original site: this endpoint only
        // inspects the brand's own homepage.
        if (!sameSite(root.toString(), next.toString())) break;
        await assertResolvablePublicHost(next.hostname);
        target = next.toString();
        finalUrl = target;
        continue;
      }

      if (!response.ok) {
        return { ok: false, reason: `The website responded with HTTP ${response.status}.`, finalUrl: target };
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('html') && !contentType.includes('xhtml')) {
        return { ok: false, reason: 'That URL did not return an HTML page.', finalUrl: target };
      }

      const bounded = await readBoundedBody(response, Math.min(env().MAX_RESEARCH_BYTES, 900_000));
      return { ok: true, html: bounded.content, finalUrl: target };
    } catch {
      return { ok: false, reason: 'The website could not be reached.', finalUrl: finalUrl ?? target };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, reason: 'The website could not be reached.', finalUrl };
}

/**
 * Deterministic, evidence-based brand identity scan.
 *
 * Returns what the website actually declares. Fields with no supporting
 * evidence come back null so the UI can show "not detected" rather than
 * inventing a plausible value.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const raw = new URL(request.url).searchParams.get('url')?.trim();
    if (!raw) {
      return NextResponse.json({ error: 'Website URL is required.' }, { status: 400 });
    }

    const root = assertPublicHttpUrl(raw);
    await assertResolvablePublicHost(root.hostname);

    const outcome = await fetchSiteHtml(root);
    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.reason, identity: null },
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const identity = extractBrandIdentity(outcome.html, outcome.finalUrl);

    return NextResponse.json(
      {
        ok: true,
        identity: { ...identity, finalUrl: identity.finalUrl ?? outcome.finalUrl },
        detectedCount: identity.palette.length,
      },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Could not inspect the website.';
    return NextResponse.json(
      { error: message, identity: null },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}