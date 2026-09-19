import { describe, it, expect, afterEach } from 'vitest';
import { env, envSchema, invalidEnvKeys, resetEnv } from './env';

describe('env schema', () => {
  const base: Record<string, string> = {
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    MAX_RESEARCH_PAGES: '10',
    MAX_RESEARCH_BYTES: '1000000',
    MAX_RESEARCH_REDIRECTS: '3',
    RESEARCH_TIMEOUT_MS: '5000',
    RESEARCH_TOTAL_BUDGET_MS: '30000',
    DEFAULT_AI_PROVIDER: 'groq',
  };

  it('validates a minimal valid environment', () => {
    const result = envSchema.parse(base);
    expect(result.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
    expect(result.MAX_RESEARCH_REDIRECTS).toBe(3);
  });

  it('coerces numeric values to integers', () => {
    const result = envSchema.parse({ ...base, MAX_RESEARCH_PAGES: '25', RESEARCH_TIMEOUT_MS: '15000' });
    expect(result.MAX_RESEARCH_PAGES).toBe(25);
    expect(result.RESEARCH_TIMEOUT_MS).toBe(15000);
  });

  it('applies default values when optional fields are missing', () => {
    const result = envSchema.parse(base);
    expect(result.GROQ_MODEL).toBe('openai/gpt-oss-20b');
    expect(result.DEFAULT_AI_PROVIDER).toBe('groq');
    expect(result.RESEARCH_USER_AGENT).not.toBe('');
  });

  it('rejects invalid NEXT_PUBLIC_APP_URL', () => {
    expect(() => envSchema.parse({ ...base, NEXT_PUBLIC_APP_URL: 'not-a-url' })).toThrow();
  });

  it('rejects invalid DEFAULT_AI_PROVIDER', () => {
    expect(() => envSchema.parse({ ...base, DEFAULT_AI_PROVIDER: 'unknown' })).toThrow();
  });

  it('rejects MAX_RESEARCH_REDIRECTS above 20', () => {
    expect(() => envSchema.parse({ ...base, MAX_RESEARCH_REDIRECTS: '30' })).toThrow();
  });

  it('rejects RESEARCH_TOTAL_BUDGET_MS above 120000', () => {
    expect(() => envSchema.parse({ ...base, RESEARCH_TOTAL_BUDGET_MS: '200000' })).toThrow();
  });

  it('allows optional provider keys to be absent', () => {
    const result = envSchema.parse(base);
    expect(result.GROQ_API_KEY).toBeUndefined();
    expect(result.SEMRUSH_API_KEY).toBeUndefined();
    expect(result.GHL_API_KEY).toBeUndefined();
  });

  it('treats empty optional keys as unset instead of failing', () => {
    const result = envSchema.parse({
      ...base,
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      GROQ_API_KEY: '',
      GROQ_MODEL: '',
      ANTHROPIC_MODEL: '',
      SEMRUSH_API_KEY: '',
      GHL_API_KEY: '',
      GHL_LOCATION_ID: '',
      DEFAULT_AI_PROVIDER: '',
    });
    expect(result.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(result.GROQ_API_KEY).toBeUndefined();
    expect(result.GROQ_MODEL).toBe('openai/gpt-oss-20b');
    expect(result.ANTHROPIC_MODEL).toBe('claude-3-5-haiku-latest');
    expect(result.DEFAULT_AI_PROVIDER).toBe('groq');
  });
});

describe('env()', () => {
  afterEach(() => {
    delete process.env.MAX_RESEARCH_PAGES;
    delete process.env.NEXT_PUBLIC_APP_URL;
    resetEnv();
  });

  it('reports no invalid keys for a valid environment', () => {
    process.env.MAX_RESEARCH_PAGES = '20';
    resetEnv();

    expect(env().MAX_RESEARCH_PAGES).toBe(20);
    expect(invalidEnvKeys()).toEqual([]);
  });

  it('falls back to the documented default for an invalid value and reports the key', () => {
    process.env.MAX_RESEARCH_PAGES = '999';
    process.env.NEXT_PUBLIC_APP_URL = 'not-a-url';
    resetEnv();

    expect(env().MAX_RESEARCH_PAGES).toBe(15);
    expect(env().NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
    expect(invalidEnvKeys()).toEqual(['MAX_RESEARCH_PAGES', 'NEXT_PUBLIC_APP_URL']);
  });
});