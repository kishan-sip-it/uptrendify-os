import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiProviderError } from './types';
import type { AiProvider, GenerateResult, ProviderHealth } from './types';
import { AiProviderRegistry, createDefaultRegistry, runWithProviderFailover, shouldFailoverAiProvider } from './registry';

function mockProvider(id: string, configured = false): AiProvider {
  return {
    id,
    defaultModel: `${id}-model`,
    configured: () => configured,
    generate: vi.fn(async (): Promise<GenerateResult> => ({ text: '', model: `${id}-model` })),
    health: vi.fn(async (): Promise<ProviderHealth> => ({ id, ok: configured, configured })),
  };
}

describe('AiProviderRegistry', () => {
  it('returns providers in order', () => {
    const registry = new AiProviderRegistry('a', [mockProvider('a', true), mockProvider('b', true)]);
    expect(registry.ids()).toEqual(['a', 'b']);
  });

  it('get returns a registered provider', () => {
    const registry = new AiProviderRegistry('a', [mockProvider('a', true)]);
    expect(registry.get('a')?.id).toBe('a');
    expect(registry.get('missing')).toBeUndefined();
  });

  it('configured filters to only configured providers', () => {
    const registry = new AiProviderRegistry('a', [
      mockProvider('a', false),
      mockProvider('b', true),
      mockProvider('c', true),
    ]);
    expect(registry.configured().map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('default returns the configured preferred provider', () => {
    const registry = new AiProviderRegistry('b', [
      mockProvider('a', true),
      mockProvider('b', true),
    ]);
    expect(registry.default()?.id).toBe('b');
  });

  it('does not silently fall back when the preferred provider is not configured', () => {
    const registry = new AiProviderRegistry('b', [
      mockProvider('a', true),
      mockProvider('b', false),
    ]);
    expect(registry.default()).toBeNull();
  });

  it('default returns null when no provider is configured', () => {
    const registry = new AiProviderRegistry('x', [mockProvider('a', false)]);
    expect(registry.default()).toBeNull();
  });

  it('health returns all providers', async () => {
    const registry = new AiProviderRegistry('a', [mockProvider('a', true), mockProvider('b', false)]);
    const health = await registry.health();
    expect(health).toHaveLength(2);
    expect(health[0].ok).toBe(true);
    expect(health[1].ok).toBe(false);
  });
});

describe('provider failover', () => {
  it('keeps the configured primary first and adds other configured providers after it', () => {
    const registry = new AiProviderRegistry('b', [
      mockProvider('a', true),
      mockProvider('b', true),
      mockProvider('c', false),
    ]);
    expect(registry.configuredInOrder().map((provider) => provider.id)).toEqual(['b', 'a']);
  });

  it('fails over on a rate-limit error and returns the successful provider', async () => {
    const first = mockProvider('groq', true);
    const second = mockProvider('gemini', true);
    const error = new (class extends Error {
      status = 429;
    })('rate limited');

    vi.mocked(first.generate).mockRejectedValueOnce(error);
    vi.mocked(second.generate).mockResolvedValueOnce({ text: 'ok', model: 'gemini-model' });

    const result = await runWithProviderFailover([first, second], (provider) => provider.generate({ prompt: 'test' }));
    expect(result.provider.id).toBe('gemini');
    expect(result.result.text).toBe('ok');
  });
});

describe('createDefaultRegistry', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a registry with all provider IDs', () => {
    const registry = createDefaultRegistry();
    expect(registry.ids()).toEqual(['groq', 'openai', 'anthropic', 'gemini']);
  });

  it('uses env-configured provider IDs', () => {
    const registry = createDefaultRegistry();
    const health = registry.list().map((p) => p.health());
    return Promise.all(health).then((all) => {
      expect(all.every((h) => ['groq', 'openai', 'anthropic', 'gemini'].includes(h.id))).toBe(true);
    });
  });
});

describe('provider failover hardening', () => {
  it('fails over on bounded transient provider errors', async () => {
    const groq = mockProvider('groq', true);
    const openai = mockProvider('openai', true);
    const result = await runWithProviderFailover([groq, openai], async (candidate) => {
      if (candidate.id === 'groq') throw new AiProviderError('groq', 'rate limited', 429);
      return 'valid-output';
    });
    expect(result.result).toBe('valid-output');
    expect(result.provider.id).toBe('openai');
  });

  it('does not fail over client-request errors', async () => {
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

function provider(id: string) {
  return { id, defaultModel: id + '-model', configured: () => true, generate: vi.fn(), health: vi.fn() };
}
