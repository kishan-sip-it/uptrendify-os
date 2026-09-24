const PRODUCTION_SUPABASE_URL = 'https://hbwpzuenihaxneqpzkrc.supabase.co';
const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nZ3IktMC6ectLH8pWrRhTg_SSJkMhPq';

export function getSupabaseConfig() {
  if (process.env.NODE_ENV === 'production') {
    // This is the browser-safe publishable key, not a service-role/secret key.
    // Pin the verified production project so a missing/stale Vercel NEXT_PUBLIC_*
    // variable cannot take the authenticated server routes offline.
    return {
      url: PRODUCTION_SUPABASE_URL,
      key: PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return { url, key };
}
