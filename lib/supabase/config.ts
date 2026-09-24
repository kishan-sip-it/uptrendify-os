const DEFAULT_SUPABASE_URL = 'https://hbwpzuenihaxneqpzkrc.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nZ3IktMC6ectLH8pWrRhTg_SSJkMhPq';

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || (
    process.env.NODE_ENV === 'production' ? DEFAULT_SUPABASE_URL : undefined
  );

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    (process.env.NODE_ENV === 'production' ? DEFAULT_SUPABASE_PUBLISHABLE_KEY : undefined);

  return { url, key };
}
