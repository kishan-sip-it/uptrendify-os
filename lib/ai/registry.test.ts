import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from './types';
import { runWithProviderFailover, shouldFailoverAiProvider } from './registry';

function provider(id: string) {
  return { id, defaultModel: id + '-model', configured: () => true, generate: vi.fn(), health: vi.fn() };
}

describe('provider failover', () => {
  it('fails over on bounded transient provider errors', async () => {
    const groq = provider('groq');
    const openai = provider('openai');
    const result = await runWithProviderFailover([groq, openai], async (candidate) => {
      if (candidate.id === 'groq') throw new AiProviderError('groq', 'rate limited', 429);
      return 'valid-output';
    });
    expect(result.result).toBe('valid-output');
    expect(result.provider.id).toBe('openai');
  });

  it('does not fail over validation or client-request errors', async () => {
    const groq = provider('groq');
    const openai = provider('openai');
    await expect(runWithProviderFailover([groq, openai], async () => {
      throw new AiProviderError('groq', 'invalid request', 400);
    })).rejects.toMatchObject({ status: 400 });
  });

  it('recognizes only transient provider statuses', () => {
    expect(shouldFailoverAiProvider(new AiProviderError('groq', 'busy', 503))).toBe(true);
    expect(shouldFailoverAiProvider(new AiProviderError('groq', 'bad input', 422))).toBe(false);
    expect(shouldFailoverAiProvider(new AiProviderError('groq', 'unauthorized', 401))).toBe(false);
  });
});
