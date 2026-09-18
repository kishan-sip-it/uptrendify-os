import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AiProvider, GenerateResult, ProviderHealth } from './types';
import { AiProviderRegistry, createDefaultRegistry } from './registry';

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