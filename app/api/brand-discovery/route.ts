import { NextResponse } from 'next/server';
import { z } from 'zod';
import { discoverBrandWebsites } from '@/lib/brand/discovery';
import { obs } from '@/lib/obs/logger';

const schema = z.object({ q: z.string().trim().min(2).max(120) });

export async function GET(request: Request) {
  try {
    const parsed = schema.safeParse({ q: new URL(request.url).searchParams.get('q') ?? '' });
    if (!parsed.success) return NextResponse.json({ suggestions: [] }, { status: 200 });
    const suggestions = await discoverBrandWebsites(parsed.data.q);
    return NextResponse.json({ ok: true, suggestions }, { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=900' } });
  } catch (error) {
    obs.warn('Brand website discovery failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: true, suggestions: [] });
  }
}
