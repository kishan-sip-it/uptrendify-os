const DEFAULT_SUPABASE_URL = 'https://hbwpzuenihaxneqpzkrc.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nZ3IktMC6ectLH8pWrRhTg_SSJkMhPq';

export function getSupabaseConfig() {
  // NODE_ENV is available in the client bundle. VERCEL_ENV is a server-side
  // deployment variable and cannot be used as the browser production switch.
  // For production builds, keep the browser + SSR clients pinned to the
  // verified project so stale/missing Vercel NEXT_PUBLIC_* values cannot break
  // authentication. Local development can still override the project.
  if (process.env.NODE_ENV === 'production') {
    return {
      url: DEFAULT_SUPABASE_URL,
      key: DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;

  return { url, key };
}
