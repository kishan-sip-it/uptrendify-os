import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { requireOrgRole, CAN_VIEW_DASHBOARD } from '@/lib/auth/roles';
import { env } from '@/lib/env';
import { assertPublicHttpUrl, assertResolvablePublicHost, fetchPublicHttp, readBoundedBody } from '@/lib/research/url-security';

export const maxDuration = 10;

function sameResearchSite(a: string, b: string): boolean {
  const normalizeHost = (value: string) => new URL(value).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const hostA = normalizeHost(a);
  const hostB = normalizeHost(b);
  return hostA === hostB || hostA.endsWith('.' + hostB) || hostB.endsWith('.' + hostA);
}

function validHexColor(value: string | undefined | null): string | null {
  const raw = value?.trim() ?? '';
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const [r, g, b] = raw.slice(1).split('');
    return ('#' + r + r + g + g + b + b).toLowerCase();
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const urlParam = new URL(request.url).searchParams.get('url')?.trim();
    if (!urlParam) return NextResponse.json({ error: 'Website URL is required.' }, { status: 400 });

    const root = assertPublicHttpUrl(urlParam);
    await assertResolvablePublicHost(root.hostname);

    let target = root.toString();
    let html = '';
    let finalUrl = target;

    for (let redirects = 0; redirects <= Math.min(env().MAX_RESEARCH_REDIRECTS, 3); redirects += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(env().RESEARCH_TIMEOUT_MS, 3500));
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
          const next = assertPublicHttpUrl(new URL(location, target).toString());
          if (!sameResearchSite(root.toString(), next.toString())) break;
          await assertResolvablePublicHost(next.hostname);
          target = next.toString();
          finalUrl = target;
          continue;
        }

        if (!response.ok) break;
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('html') && !contentType.includes('xhtml')) break;

        const bounded = await readBoundedBody(response, Math.min(env().MAX_RESEARCH_BYTES, 800_000));
        html = bounded.content;
        finalUrl = target;
        break;
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!html) {
      return NextResponse.json({ ok: true, primaryColor: null, source: null, finalUrl }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const $ = cheerio.load(html);
    const candidates = [
      $('meta[name="theme-color"]').first().attr('content'),
      $('meta[name="msapplication-TileColor"]').first().attr('content'),
    ];
    const primaryColor = candidates.map(validHexColor).find(Boolean) ?? null;

    return NextResponse.json(
      { ok: true, primaryColor, source: primaryColor ? 'theme-color' : null, finalUrl },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not inspect the website.',
        primaryColor: null,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
