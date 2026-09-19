import { NextResponse } from 'next/server';
import { getSupabaseConfig } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { url, key } = getSupabaseConfig();
  const adminConfigured = Boolean(
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    process.env.SUPABASE_SECRET?.trim(),
  );

  return NextResponse.json(
    {
      ok: true,
      build: {
        vercelCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
      },
      integrations: {
        supabase: Boolean(url && key),
        supabaseAdminConfigured: adminConfigured,
        supabaseDbReachable: Boolean(url && key),
        aiProvider: process.env.DEFAULT_AI_PROVIDER ?? 'groq',
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
