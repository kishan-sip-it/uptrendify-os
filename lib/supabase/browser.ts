import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase browser environment is not configured');
  }

  // Never allow a Supabase service-role key to reach the browser client.
  try {
    const payload = JSON.parse(
      Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { role?: string };

    if (payload.role === 'service_role') {
      throw new Error('Supabase service-role key cannot be used in the browser');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('service-role')) throw error;
    // Publishable keys (sb_publishable_...) are opaque and intentionally have
    // no JWT payload, so they are valid here.
  }

  return createBrowserClient(url, key);
}
