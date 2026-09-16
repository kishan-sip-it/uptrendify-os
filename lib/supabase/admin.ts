import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let cached: SupabaseClient | null = null;

export function createSupabaseAdminClient() {
  if (cached) return cached;
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase admin environment is not configured');
  }
  cached = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}