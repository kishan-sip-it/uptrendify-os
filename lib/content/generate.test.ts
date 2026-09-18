import { describe, it, expect, vi } from 'vitest';
import type { AiProvider, GenerateInput, GenerateResult } from '@/lib/ai/types';
import { AiProviderError } from '@/lib/ai/types';
import { extractContent } from './generate';
import { ContentValidationError } from './schema';

const INTENT = { type: 'social_post', channel: 'linkedin' };

function fakeProvider(handler: (input: GenerateInput, attempt: number) => Promise<GenerateResult>): AiProvider {
  let attempt = 0;
  return {
    id: 'fake',
    defaultModel: 'fake-model',
    configured: () => true,
    health: async () => ({ id: 'fake', ok: true, configured: true }),
    generate: async (input) => {
      attempt += 1;
      return handler(input, attempt);
    },
  };
}

function okJson(headline = 'H', body = 'B'): string {
  return JSON.stringify({ headline, body, channel: 'linkedin', content_type: 'social_post' });
}

describe('extractContent', () => {
  it('returns a parsed generation on a clean provider response', async () => {
    const provider = fakeProvider(async () => ({ text: okJson('Clean headline'), model: 'fake-model', usage: { inputTokens: 10, outputTokens: 20 } }));
    const outcome = await extractContent(provider, 'PROMPT', INTENT);
    expect(outcome.result.headline).toBe('Clean headline');
    expect(outcome.model).toBe('fake-model');
    expect(outcome.usage?.outputTokens).toBe(20);
  });

  it('repairs invalid output once using a repair prompt', async () => {
    const provider = fakeProvider(async (input, attempt) => {
      if (attempt === 1) return { text: 'not-json', model: 'fake-model' };
      return { text: okJson('Repaired headline'), model: 'fake-model' };
    });
    const outcome = await extractContent(provider, 'PROMPT', INTENT);
    expect(outcome.result.headline).toBe('Repaired headline');
  });

  it('repairs channel mismatches via the repair prompt', async () => {
    const provider = fakeProvider(async (input, attempt) => {
      if (attempt === 1) return { text: JSON.stringify({ headline: 'H', body: 'B', channel: 'instagram', content_type: 'social_post' }), model: 'fake-model' };
      return { text: okJson('Fixed channel'), model: 'fake-model' };
    });
    const outcome = await extractContent(provider, 'PROMPT', INTENT);
    expect(outcome.result.headline).toBe('Fixed channel');
  });

  it('throws a validation error when both attempts are invalid', async () => {
    const provider = fakeProvider(async () => ({ text: 'still-not-json', model: 'fake-model' }));
    await expect(extractContent(provider, 'PROMPT', INTENT)).rejects.toBeInstanceOf(ContentValidationError);
  });

  it('propagates provider errors without a repair attempt', async () => {
    const generate = vi.fn(async () => {
      throw new AiProviderError('fake', 'rate limited', 429);
    });
    const provider = { id: 'fake', defaultModel: 'fake-model', configured: () => true, health: async () => ({ id: 'fake', ok: true } as never), generate };
    await expect(extractContent(provider as AiProvider, 'PROMPT', INTENT)).rejects.toBeInstanceOf(AiProviderError);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});