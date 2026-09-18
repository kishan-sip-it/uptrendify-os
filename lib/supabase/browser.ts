import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig } from './config';

export function createSupabaseBrowserClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new Error('Supabase browser environment is not configured');
  }

  // Never allow a Supabase service-role/secret key to reach the browser client.
  if (key.startsWith('sb_secret_')) {
    throw new Error('Supabase secret key cannot be used in the browser');
  }

  try {
    const payload = JSON.parse(
      Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { role?: string };

    if (payload.role === 'service_role') {
      throw new Error('Supabase service-role key cannot be used in the browser');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('service-role')) throw error;
  }

  return createBrowserClient(url, key);
}
