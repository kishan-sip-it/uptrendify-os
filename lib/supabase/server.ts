import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from './config';
import { env } from '@/lib/env';

export async function createSupabaseServerClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new Error('Supabase server environment is not configured');
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components may not always be allowed to mutate cookies.
        }
      },
    },
  });
}
