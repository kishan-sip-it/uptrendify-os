import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/supabase/config';

let cached: SupabaseClient | null = null;

export function createSupabaseAdminClient() {
  if (cached) return cached;

  const { url } = getSupabaseConfig();
  const adminKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !adminKey) {
    throw new Error('Supabase admin environment is not configured');
  }

  cached = createClient(url, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cached;
}
