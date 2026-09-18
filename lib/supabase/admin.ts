import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { getSupabaseConfig } from '@/lib/supabase/config';

let cached: SupabaseClient | null = null;

export function createSupabaseAdminClient() {
  if (cached) return cached;
  const e = env();
  const { url } = getSupabaseConfig();
  const adminKey = e.SUPABASE_SECRET_KEY || e.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !adminKey) {
    throw new Error('Supabase admin environment is not configured');
  }
  cached = createClient(url, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
