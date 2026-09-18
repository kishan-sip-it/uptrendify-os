const PRODUCTION_SUPABASE_URL = 'https://hbwpzuenihaxneqpzkrc.supabase.co';
const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nZ3IktMC6ectLH8pWrRhTg_SSJkMhPq';

export function getSupabaseConfig() {
  const isProduction = process.env.NODE_ENV === 'production';

  // Production uses the verified active publishable key. This is safe for
  // browser use with Supabase RLS and user Auth sessions.
  if (isProduction) {
    return {
      url: PRODUCTION_SUPABASE_URL,
      key: PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return { url, key };
}
