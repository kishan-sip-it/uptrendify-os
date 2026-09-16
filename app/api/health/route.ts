import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function GET() {
  const e = env();
  return NextResponse.json({
    ok: true,
    service: 'uptrendify-os',
    timestamp: new Date().toISOString(),
    providers: {
      groq: Boolean(e.GROQ_API_KEY),
      openai: Boolean(e.OPENAI_API_KEY),
      anthropic: Boolean(e.ANTHROPIC_API_KEY),
      gemini: Boolean(e.GEMINI_API_KEY),
    },
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
      timeoutMs: e.RESEARCH_TIMEOUT_MS,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
