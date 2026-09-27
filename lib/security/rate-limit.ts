import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

export type RateLimitPolicy = {
  limit: number;
  windowSeconds: number;
};

const DEFAULT_POLICY: RateLimitPolicy = { limit: 120, windowSeconds: 60 };
const WRITE_POLICY: RateLimitPolicy = { limit: 40, windowSeconds: 60 };
const AUTH_POLICY: RateLimitPolicy = { limit: 20, windowSeconds: 60 };
const EXPENSIVE_POLICY: RateLimitPolicy = { limit: 10, windowSeconds: 60 };

function normalizeIp(value: string | null) {
  const ip = value?.split(',')[0]?.trim();
  return ip && ip.length <= 128 ? ip : 'unknown';
}

export function getClientIp(request: Request) {
  return normalizeIp(
    request.headers.get('x-vercel-forwarded-for') ??
      request.headers.get('x-forwarded-for') ??
      request.headers.get('x-real-ip'),
  );
}

export function getRateLimitPolicy(pathname: string, method: string): RateLimitPolicy {
  const normalizedPath = pathname.toLowerCase();
  const normalizedMethod = method.toUpperCase();

  if (normalizedPath.startsWith('/api/auth/')) return AUTH_POLICY;

  if (
    normalizedPath.includes('/research') ||
    normalizedPath.includes('/generate') ||
    normalizedPath.includes('/brand-discovery') ||
    normalizedPath.includes('/strategy') ||
    normalizedPath.includes('/brain') ||
    normalizedPath.includes('/publish')
  ) {
    return EXPENSIVE_POLICY;
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) return WRITE_POLICY;

  return DEFAULT_POLICY;
}

export function buildRateLimitKey(request: Request, pathname: string) {
  return `ip:${getClientIp(request)}:path:${pathname}`;
}

export async function consumeRateLimit(
  request: Request,
  pathname: string,
  policy: RateLimitPolicy = getRateLimitPolicy(pathname, request.method),
): Promise<RateLimitDecision> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_bucket_key: buildRateLimitKey(request, pathname),
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
  });

  if (error) throw new Error(`Rate limiter unavailable: ${error.message}`);

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result.allowed !== 'boolean' || !result.reset_at) {
    throw new Error('Rate limiter returned an invalid decision');
  }

  return {
    allowed: result.allowed,
    limit: policy.limit,
    remaining: Math.max(0, Number(result.remaining) || 0),
    resetAt: new Date(result.reset_at),
  };
}

export function applyRateLimitHeaders(response: Response, decision: RateLimitDecision) {
  response.headers.set('X-RateLimit-Limit', String(decision.limit));
  response.headers.set('X-RateLimit-Remaining', String(decision.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.max(0, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000))));
  return response;
}

export function rateLimitResponse(decision: RateLimitDecision) {
  const retryAfter = Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000));
  const response = Response.json(
    { error: 'Too many requests. Please slow down and try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
  );
  return applyRateLimitHeaders(response, decision);
}

export { DEFAULT_POLICY, WRITE_POLICY, AUTH_POLICY, EXPENSIVE_POLICY };
