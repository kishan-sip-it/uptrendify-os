import { describe, it, expect } from 'vitest';
import { AiProviderError } from './types';
import { classifyProviderFailure, isRetryableProviderFailure } from './classify';

describe('classifyProviderFailure', () => {
  it('classifies 429 as RATE_LIMITED + retryable', () => {
    const f = classifyProviderFailure(new AiProviderError('test', 'Too many requests', 429));
    expect(f.code).toBe('RATE_LIMITED');
    expect(f.retryable).toBe(true);
  });

  it('classifies 503 as SERVICE_UNAVAILABLE + retryable', () => {
    const f = classifyProviderFailure(new AiProviderError('test', 'Service unavailable', 503));
    expect(f.code).toBe('SERVICE_UNAVAILABLE');
    expect(f.retryable).toBe(true);
  });

  it('classifies 401 as AUTHENTICATION_ERROR, not retried', () => {
    const f = classifyProviderFailure(new AiProviderError('test', 'Unauthorized', 401));
    expect(f.code).toBe('AUTHENTICATION_ERROR');
    expect(f.retryable).toBe(false);
  });

  it('leaves AiProviderError unchanged through retry classification', () => {
    const err = new AiProviderError('test', 'Cannot read properties of undefined', 422);
    expect(classifyProviderFailure(err).code).toBe('VALIDATION_ERROR');
    expect(isRetryableProviderFailure(err)).toBe(false);
  });
});
