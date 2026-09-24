const DEFAULT_SUPABASE_URL = 'https://hbwpzuenihaxneqpzkrc.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nZ3IktMC6ectLH8pWrRhTg_SSJkMhPq';

export function getSupabaseConfig() {
  const isVercelProduction = process.env.VERCEL_ENV === 'production';

  const url = isVercelProduction
    ? DEFAULT_SUPABASE_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || (
        process.env.NODE_ENV === 'production' ? DEFAULT_SUPABASE_URL : undefined
      );

  const key = isVercelProduction
    ? DEFAULT_SUPABASE_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      (process.env.NODE_ENV === 'production' ? DEFAULT_SUPABASE_PUBLISHABLE_KEY : undefined);

  return { url, key };
}
