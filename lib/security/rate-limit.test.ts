import { describe, expect, it } from 'vitest';
import {
  AUTH_POLICY,
  DEFAULT_POLICY,
  EXPENSIVE_POLICY,
  WRITE_POLICY,
  buildRateLimitKey,
  getClientIp,
  getRateLimitBucket,
  getRateLimitPolicy,
} from './rate-limit';

function request(pathname: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`https://uptrendify-os.vercel.app${pathname}`, {
    method,
    headers,
  });
}

describe('rate-limit policy', () => {
  it('uses the Vercel client IP header and ignores a spoofable forwarded list', () => {
    const req = request('/api/test', {
      'x-vercel-forwarded-for': '203.0.113.10',
      'x-forwarded-for': '198.51.100.20, 203.0.113.10',
    });

    expect(getClientIp(req)).toBe('203.0.113.10');
    expect(buildRateLimitKey(req, '/api/test')).toBe('ip:203.0.113.10:bucket:read');
  });

  it('uses the auth policy for auth APIs', () => {
    expect(getRateLimitPolicy('/api/auth/bootstrap', 'POST')).toEqual(AUTH_POLICY);
    expect(getRateLimitBucket('/api/auth/bootstrap', 'POST')).toBe('auth');
  });

  it('uses a stricter shared bucket for expensive operations', () => {
    expect(getRateLimitPolicy('/api/brands/123/research', 'POST')).toEqual(EXPENSIVE_POLICY);
    expect(getRateLimitPolicy('/api/brands/123/content/456/generate', 'POST')).toEqual(EXPENSIVE_POLICY);
    expect(getRateLimitPolicy('/api/brand-discovery', 'POST')).toEqual(EXPENSIVE_POLICY);
    expect(getRateLimitBucket('/api/brands/123/research', 'POST')).toBe('expensive');
    expect(getRateLimitBucket('/api/brands/999/research', 'POST')).toBe('expensive');
  });

  it('uses the write policy for ordinary mutations', () => {
    expect(getRateLimitPolicy('/api/workspace', 'PATCH')).toEqual(WRITE_POLICY);
    expect(getRateLimitPolicy('/api/team', 'POST')).toEqual(WRITE_POLICY);
    expect(getRateLimitBucket('/api/workspace', 'PATCH')).toBe('write');
  });

  it('keeps ordinary reads on the higher read quota', () => {
    expect(getRateLimitPolicy('/api/dashboard', 'GET')).toEqual(DEFAULT_POLICY);
    expect(getRateLimitBucket('/api/dashboard', 'GET')).toBe('read');
  });
});

// CI trigger marker: final security hardening verification.
