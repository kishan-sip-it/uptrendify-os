import { env } from '@/lib/env';
import type { AiProvider, ProviderHealth } from './types';
import { createGroqProvider, createOpenAiProvider } from './providers/openai-compatible';
import { createAnthropicProvider } from './providers/anthropic';
import { createGeminiProvider } from './providers/gemini';

export class AiProviderRegistry {
  private providers = new Map<string, AiProvider>();
  private defaultId: string;

  constructor(defaultId: string, providers: AiProvider[]) {
    for (const provider of providers) this.providers.set(provider.id, provider);
    this.defaultId = defaultId;
  }

  register(provider: AiProvider) {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AiProvider | undefined {
    return this.providers.get(id);
  }

  list(): AiProvider[] {
    return [...this.providers.values()];
  }

  configured(): AiProvider[] {
    return this.list().filter((provider) => provider.configured());
  }

  ids(): string[] {
    return this.list().map((provider) => provider.id);
  }

  default(): AiProvider | null {
    // Never silently switch providers. The configured primary provider is
    // intentional, especially for quota/cost control. An unconfigured primary
    // must fail explicitly instead of unexpectedly consuming another provider.
    const preferred = this.providers.get(this.defaultId);
    return preferred?.configured() ? preferred : null;
  }

  async health(): Promise<ProviderHealth[]> {
    return Promise.all(this.list().map((provider) => provider.health()));
  }
}

export function shouldFailoverAiProvider(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; retryable?: unknown };
  if (candidate.retryable === true) return true;
  if (typeof candidate.status === 'number') {
    return candidate.status === 0 || candidate.status === 429 || candidate.status === 502 || candidate.status === 503 || candidate.status === 504;
  }
  return false;
}

export async function runWithProviderFailover<T>(
  providers: AiProvider[],
  run: (provider: AiProvider) => Promise<T>,
  onFailover?: (failed: AiProvider, next: AiProvider, error: unknown) => Promise<void> | void,
): Promise<{ result: T; provider: AiProvider }> {
  let lastError: unknown = null;

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]!;
    try {
      const result = await run(provider);
      return { result, provider };
    } catch (error) {
      lastError = error;
      const next = providers[index + 1];
      if (!next || !shouldFailoverAiProvider(error)) throw error;
      await onFailover?.(provider, next, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No configured AI provider completed the request.');
}

export function createDefaultRegistry(): AiProviderRegistry {
  const e = env();
  return new AiProviderRegistry(e.DEFAULT_AI_PROVIDER, [
    createGroqProvider(e.GROQ_API_KEY ?? null, e.GROQ_MODEL),
    createOpenAiProvider(e.OPENAI_API_KEY ?? null, e.OPENAI_MODEL),
    createAnthropicProvider(e.ANTHROPIC_API_KEY ?? null, e.ANTHROPIC_MODEL),
    createGeminiProvider(e.GEMINI_API_KEY ?? null, e.GEMINI_MODEL),
  ]);
}