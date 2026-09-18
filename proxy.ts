import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';

const PUBLIC_PATHS = new Set([
  '/',
  '/progress',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

const AUTH_PATHS = new Set(['/login', '/register', '/forgot-password', '/reset-password']);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPage =
    PUBLIC_PATHS.has(pathname) ||
    pathname === '/api/health' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico';

  // Public routes must not depend on Supabase being available.
  if (isPublicPage) {
    return NextResponse.next();
  }

  const e = env();

  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      e.NEXT_PUBLIC_SUPABASE_URL,
      e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
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
      },
    );

    const { data } = await supabase.auth.getClaims();
    const user = data?.claims?.sub ? data.claims : null;

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      return NextResponse.redirect(url);
    }

    if (AUTH_PATHS.has(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  } catch {
    // Never let auth middleware take the whole deployment down.
    // Protected routes fall back to the login page until auth can be verified.
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
