import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseConfig } from '@/lib/supabase/config';

const PUBLIC_PATHS = new Set([
  '/',
  '/progress',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/confirm',
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

  if (isPublicPage) {
    return NextResponse.next();
  }

  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  let response = NextResponse.next({ request });

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
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
