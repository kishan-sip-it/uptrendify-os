import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig } from './config';

export function createSupabaseBrowserClient(options: { flowType?: 'pkce' | 'implicit' } = {}) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new Error('Supabase browser environment is not configured');
  }

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
    }
  }

  return createBrowserClient(url, key, {
    auth: {
      flowType: options.flowType ?? 'pkce',
    },
  });
}
