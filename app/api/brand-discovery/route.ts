import { NextResponse } from 'next/server';
import { CAN_VIEW_DASHBOARD, requireOrgRole } from '@/lib/auth/roles';
import { discoverBrandWebsites } from '@/lib/brand-discovery';

export async function GET(request: Request) {
  const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
  if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return NextResponse.json({ ok: true, candidates: [] });

  try {
    const candidates = await discoverBrandWebsites(query);
    return NextResponse.json(
      { ok: true, candidates },
      { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } },
    );
  } catch {
    return NextResponse.json({ ok: true, candidates: [] });
  }
}
