import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { createDefaultRegistry } from '@/lib/ai/registry';

export async function GET() {
  const e = env();
  const registry = createDefaultRegistry();
  const health = await registry.health();
  const defaultProvider = registry.default();

  return NextResponse.json({
    ok: true,
    service: 'uptrendify-os',
    timestamp: new Date().toISOString(),
    providers: Object.fromEntries(health.map((h) => [h.id, h.ok])),
    defaultProvider: defaultProvider?.id ?? null,
    integrations: {
      supabase: Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      semrush: Boolean(e.SEMRUSH_API_KEY),
      surfer: Boolean(e.SURFER_API_KEY),
      jasper: Boolean(e.JASPER_API_KEY),
      goHighLevel: Boolean(e.GHL_API_KEY && e.GHL_LOCATION_ID),
    },
    research: {
      maxPages: e.MAX_RESEARCH_PAGES,
      maxBytes: e.MAX_RESEARCH_BYTES,
      maxRedirects: e.MAX_RESEARCH_REDIRECTS,
      timeoutMs: e.RESEARCH_TIMEOUT_MS,
      totalBudgetMs: e.RESEARCH_TOTAL_BUDGET_MS,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}