import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';

export async function middleware(request: NextRequest) {
  const e = env();
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  if (e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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

    const { data: { user } } = await supabase.auth.getUser();

    const isPublicPage =
      pathname === '/login' ||
      pathname === '/api/health' ||
      pathname.startsWith('/api/auth') ||
      pathname === '/_next' ||
      pathname.startsWith('/_next') ||
      pathname === '/favicon.ico';

    if (!user && !isPublicPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};