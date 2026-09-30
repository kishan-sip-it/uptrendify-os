import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseConfig } from '@/lib/supabase/config';
import {
  applyRateLimitHeaders,
  consumeRateLimit,
  rateLimitResponse,
} from '@/lib/security/rate-limit';

const PUBLIC_PATHS = new Set([
  '/',
  '/progress',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/confirm',
  '/auth/confirmed',
  '/about',
  '/contact',
  '/feedback',
  '/report-issue',
  '/terms',
  '/privacy',
]);

const AUTH_PATHS = new Set(['/login', '/register', '/forgot-password', '/reset-password']);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRequest = pathname.startsWith('/api/');
  const isAuthApiRequest = pathname.startsWith('/api/auth/');
  const { url, key } = getSupabaseConfig();

  let response = NextResponse.next({ request });
  let authenticatedApiRequest = false;

  // Authentication and account/workspace actions are intentionally not subject
  // to the shared IP rate limiter. Public/unauthenticated APIs remain protected.
  // This prevents one signed-in user from exhausting an IP-wide bucket while
  // using legitimate high-frequency workflows such as Brand Brain research.
  if (isApiRequest && !isAuthApiRequest && url && key) {
    try {
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(values) {
            values.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      });

      const { data } = await supabase.auth.getClaims();
      authenticatedApiRequest = Boolean(data?.claims?.sub);
    } catch {
      authenticatedApiRequest = false;
    }
  }

  if (isApiRequest && !authenticatedApiRequest) {
    try {
      const decision = await consumeRateLimit(request, pathname);
      if (!decision.allowed) return rateLimitResponse(decision);

      return applyRateLimitHeaders(response, decision);
    } catch (error) {
      // consumeRateLimit itself has a bounded local fallback, so limiter backend
      // failures must never turn a healthy API request into a 503.
      console.error('[rate-limit] request limiter error after fallback', error);
    }
  }

  if (isApiRequest) return response;

  const isPublicPage =
    PUBLIC_PATHS.has(pathname) ||
    pathname === '/api/health' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico';

  if (isPublicPage) {
    return response;
  }

  if (!url || !key) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data } = await supabase.auth.getClaims();
    const user = data?.claims?.sub ? data.claims : null;

    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }

    if (AUTH_PATHS.has(pathname)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }
  } catch {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
