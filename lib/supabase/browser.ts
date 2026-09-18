import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig } from './config';

export function createSupabaseBrowserClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new Error('Supabase browser environment is not configured');
  }

  // Secret/service-role keys are server-only. Publishable keys and legacy anon JWTs are safe here.
  if (key.startsWith('sb_secret_')) {
    throw new Error('Supabase secret key cannot be used in the browser');
  }

  if (key.startsWith('eyJ')) {
    try {
      const payloadSegment = key.split('.')[1] ?? '';
      const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
      const payload = JSON.parse(window.atob(padded)) as { role?: string };
      if (payload.role === 'service_role') {
        throw new Error('Supabase service-role key cannot be used in the browser');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('service-role')) throw error;
      // An invalid legacy JWT will be rejected by Supabase itself.
    }
  }

  return createBrowserClient(url, key);
}
