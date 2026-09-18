const PLACEHOLDER_URL = 'https://your-project-ref.supabase.co';

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Browser and SSR application clients use the publishable/anon key together
  // with the signed-in user's Auth session and RLS. A secret/service-role key
  // is intentionally not accepted here.
  return { url, key, placeholderUrl: PLACEHOLDER_URL };
}
