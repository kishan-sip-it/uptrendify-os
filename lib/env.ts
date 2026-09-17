import { z } from 'zod';

function optionalString(field: string) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional().describe(field),
  );
}

function optionalUrl(field: string) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().url().optional().describe(field),
  );
}

function stringWithDefault(field: string, fallback: string) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).default(fallback).describe(field),
  );
}

export const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl('NEXT_PUBLIC_SUPABASE_URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: optionalString('SUPABASE_SERVICE_ROLE_KEY'),
  GROQ_API_KEY: optionalString('GROQ_API_KEY'),
  GROQ_MODEL: stringWithDefault('GROQ_MODEL', 'llama-3.3-70b-versatile'),
  OPENAI_API_KEY: optionalString('OPENAI_API_KEY'),
  OPENAI_MODEL: stringWithDefault('OPENAI_MODEL', 'gpt-4o-mini'),
  ANTHROPIC_API_KEY: optionalString('ANTHROPIC_API_KEY'),
  ANTHROPIC_MODEL: stringWithDefault('ANTHROPIC_MODEL', 'claude-3-5-haiku-latest'),
  GEMINI_API_KEY: optionalString('GEMINI_API_KEY'),
  GEMINI_MODEL: stringWithDefault('GEMINI_MODEL', 'gemini-3.7-flash'),
  DEFAULT_AI_PROVIDER: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.enum(['groq', 'openai', 'anthropic', 'gemini']).default('groq'),
  ),
  SEMRUSH_API_KEY: optionalString('SEMRUSH_API_KEY'),
  SURFER_API_KEY: optionalString('SURFER_API_KEY'),
  JASPER_API_KEY: optionalString('JASPER_API_KEY'),
  GHL_API_KEY: optionalString('GHL_API_KEY'),
  GHL_LOCATION_ID: optionalString('GHL_LOCATION_ID'),
  RESEARCH_USER_AGENT: stringWithDefault('RESEARCH_USER_AGENT', 'UpTrendifyOSBot/1.0'),
  MAX_RESEARCH_PAGES: z.coerce.number().int().positive().max(100).default(15),
  MAX_RESEARCH_BYTES: z.coerce.number().int().positive().max(20_000_000).default(5_000_000),
  MAX_RESEARCH_REDIRECTS: z.coerce.number().int().min(0).max(20).default(5),
  RESEARCH_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(12_000),
  RESEARCH_TOTAL_BUDGET_MS: z.coerce.number().int().positive().max(120_000).default(45_000),
});

let cached: z.infer<typeof envSchema> | null = null;

export function env() {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}
