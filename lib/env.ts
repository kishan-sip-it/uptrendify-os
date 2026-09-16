import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default('gemini-3.7-flash'),
  SEMRUSH_API_KEY: z.string().min(1).optional(),
  SURFER_API_KEY: z.string().min(1).optional(),
  JASPER_API_KEY: z.string().min(1).optional(),
  GHL_API_KEY: z.string().min(1).optional(),
  GHL_LOCATION_ID: z.string().min(1).optional(),
  RESEARCH_USER_AGENT: z.string().default('UpTrendifyOSBot/1.0'),
  MAX_RESEARCH_PAGES: z.coerce.number().int().positive().max(100).default(15),
  MAX_RESEARCH_BYTES: z.coerce.number().int().positive().max(20_000_000).default(5_000_000),
  RESEARCH_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(12_000),
});

let cached: z.infer<typeof envSchema> | null = null;

export function env() {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}
