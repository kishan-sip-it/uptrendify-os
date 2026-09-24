import { afterEach, describe, expect, it } from 'vitest';
import { getSupabaseConfig } from './config';

const originalNodeEnv = process.env.NODE_ENV;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.VERCEL_ENV = originalVercelEnv;

  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;

  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;

  if (originalAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
});

describe('getSupabaseConfig', () => {
  it('uses the verified project in production even when deployment env values are stale', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://wrong-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'wrong-publishable-key';

    expect(getSupabaseConfig()).toEqual({
      url: 'https://hbwpzuenihaxneqpzkrc.supabase.co',
      key: 'sb_publishable_nZ3IktMC6ectLH8pWrRhTg_SSJkMhPq',
    });
  });

  it('allows local development to use explicit project environment values', () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-publishable-key';

    expect(getSupabaseConfig()).toEqual({
      url: 'https://local-project.supabase.co',
      key: 'local-publishable-key',
    });
  });
});
