import { NextResponse } from 'next/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { invalidEnvKeys } from '@/lib/env';
import { projectRefFromUrl, PRODUCTION_SUPABASE_PROJECT_REF } from '@/lib/production-sync';

export const dynamic = 'force-dynamic';

async function probe(url: string, key: string, path: string) {
  try {
    const response = await fetch(url.replace(/\/$/, '') + path, {
      headers: { apikey: key, Authorization: 'Bearer ' + key },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const { url, key } = getSupabaseConfig();
  const envKeys = invalidEnvKeys();
  const projectRef = projectRefFromUrl(url);

  let authReachable = false;
  let dbReachable = false;

  if (url && key) {
    [authReachable, dbReachable] = await Promise.all([
      probe(url, key, '/auth/v1/settings'),
      probe(url, key, '/rest/v1/organizations?select=id&limit=1'),
    ]);
  }

  const adminConfigured = Boolean(
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    process.env.SUPABASE_SECRET?.trim(),
  );

  const productionProjectAligned =
    !process.env.VERCEL_ENV ||
    process.env.VERCEL_ENV !== 'production' ||
    projectRef === PRODUCTION_SUPABASE_PROJECT_REF;

  return NextResponse.json(
    {
      ok: Boolean(url && key && envKeys.length === 0 && productionProjectAligned),
      build: {
        vercelCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
        productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
      },
      integrations: {
        supabase: Boolean(url && key),
        supabaseAuthReachable: authReachable,
        supabaseDbReachable: dbReachable,
        supabaseProjectRef: projectRef,
        supabaseAdminConfigured: adminConfigured,
        aiProvider: process.env.DEFAULT_AI_PROVIDER ?? 'groq',
      },
      config: {
        valid: envKeys.length === 0,
        invalidKeys: envKeys,
      },
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' }, status: 200 },
  );
}