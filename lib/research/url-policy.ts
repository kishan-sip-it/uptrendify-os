import { assertPublicHttpUrl } from './url-security';

const TRACKING_REDIRECT_HOSTS = new Set([
  'l.facebook.com',
  'lm.facebook.com',
  'l.instagram.com',
  'l.messenger.com',
  'l.linkedin.com',
  'lnkd.in',
]);

const REDIRECT_QUERY_KEYS = [
  'u',
  'url',
  'target',
  'dest',
  'destination',
  'redirect',
  'redirect_url',
  'redirect_uri',
  'uddg',
];

const TRACKING_QUERY_PREFIXES = ['utm_'];
const TRACKING_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_gl',
  'igshid',
  'si',
]);

const LOW_SIGNAL_PATHS = [
  /^\/login(?:\/|$)/i,
  /^\/signin(?:\/|$)/i,
  /^\/sign-in(?:\/|$)/i,
  /^\/signup(?:\/|$)/i,
  /^\/sign-up(?:\/|$)/i,
  /^\/register(?:\/|$)/i,
  /^\/logout(?:\/|$)/i,
  /^\/password(?:\/|$)/i,
  /^\/recover(?:\/|$)/i,
  /^\/reset-password(?:\/|$)/i,
  /^\/oauth(?:\/|$)/i,
  /^\/auth(?:\/|$)/i,
];

function hostKey(host: string): string {
  return host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function isKnownRedirectHost(url: URL): boolean {
  const host = hostKey(url.hostname);
  return TRACKING_REDIRECT_HOSTS.has(host) ||
    (host === 'facebook.com' && /^\/l\.php$/i.test(url.pathname));
}

function decodeRedirectTarget(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return /^https?:\/\//i.test(value) ? value : null;
  }
}

export function isTrackingRedirectUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return isKnownRedirectHost(url) && REDIRECT_QUERY_KEYS.some((key) => Boolean(decodeRedirectTarget(url.searchParams.get(key) ?? '')));
  } catch {
    return false;
  }
}

export function unwrapRedirectUrl(raw: string): string {
  let current = raw;

  for (let depth = 0; depth < 3; depth += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      break;
    }

    if (!isKnownRedirectHost(parsed)) break;

    const nextTarget = REDIRECT_QUERY_KEYS
      .map((key) => parsed.searchParams.get(key))
      .map((value) => value ? decodeRedirectTarget(value) : null)
      .find((value): value is string => Boolean(value));

    if (!nextTarget) break;
    current = nextTarget;
  }

  return current;
}

export function stripTrackingQuery(url: URL): URL {
  const next = new URL(url.toString());

  for (const key of Array.from(next.searchParams.keys())) {
    const lower = key.toLowerCase();
    if (TRACKING_QUERY_PREFIXES.some((prefix) => lower.startsWith(prefix)) || TRACKING_QUERY_KEYS.has(lower)) {
      next.searchParams.delete(key);
    }
  }

  next.hash = '';
  return next;
}

export function normalizeResearchUrl(raw: string): string {
  const unwrapped = unwrapRedirectUrl(raw);
  const safe = assertPublicHttpUrl(unwrapped);
  const normalized = stripTrackingQuery(safe);
  normalized.pathname = normalized.pathname || '/';
  return normalized.toString();
}

export function sameResearchSite(a: string, b: string): boolean {
  const hostA = hostKey(new URL(a).hostname);
  const hostB = hostKey(new URL(b).hostname);
  return hostA === hostB || hostA.endsWith('.' + hostB) || hostB.endsWith('.' + hostA);
}

export function isLowSignalResearchPath(raw: string): boolean {
  try {
    const pathname = new URL(raw).pathname;
    return LOW_SIGNAL_PATHS.some((pattern) => pattern.test(pathname));
  } catch {
    return true;
  }
}

export function isResearchCandidate(root: string, candidate: string): boolean {
  if (!sameResearchSite(root, candidate)) return false;
  if (isTrackingRedirectUrl(candidate)) return false;
  if (isLowSignalResearchPath(candidate)) return false;
  return true;
}
