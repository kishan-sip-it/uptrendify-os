const PRODUCTION_SUPABASE_URL = 'https://hbwpzuenihaxneqpzkrc.supabase.co';
const PRODUCTION_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhid3B6dWVuaWhheG5lcXB6a3JjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NDQ3ODEsImV4cCI6MjEwNTEyMDc4MX0.02fAa_j56vZnNImsBjhQJKcJc_BIB21lO4co53rRAuMwM';

export function getSupabaseConfig() {
  const isProduction = process.env.NODE_ENV === 'production';

  // Keep production auth deterministic while the Vercel environment variables
  // are being reconciled. This is the public legacy anon key, not a secret.
  // RLS and the signed-in Auth session remain the authorization boundary.
  if (isProduction) {
    return {
      url: PRODUCTION_SUPABASE_URL,
      key: PRODUCTION_SUPABASE_ANON_KEY,
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return { url, key };
}
