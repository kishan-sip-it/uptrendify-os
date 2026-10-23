import { env } from '@/lib/env';
import type { AiProvider, ProviderHealth } from './types';
import { createGroqProvider, createOpenAiProvider } from './providers/openai-compatible';
import { createAnthropicProvider } from './providers/anthropic';

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

  configuredInOrder(): AiProvider[] {
    const configured = this.configured();
    const preferred = this.providers.get(this.defaultId);
    if (!preferred?.configured()) return configured;
    return [preferred, ...configured.filter((provider) => provider.id !== preferred.id)];
  }

  ids(): string[] {
    return this.list().map((provider) => provider.id);
  }

  default(): AiProvider | null {
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
    // Provider overloads and transient upstream outages should advance to the next configured provider.
    return [0, 401, 403, 408, 425, 429, 500, 502, 503, 504, 520, 522, 524, 529].includes(candidate.status);
  }
  return false;
}

export async function runWithProviderFailover<T>(
  providers: AiProvider[],
  run: (provider: AiProvider) => Promise<T>,
  onFailover?: (failed: AiProvider, next: AiProvider, error: unknown) => Promise<void> | void,
  signal?: AbortSignal,
): Promise<{ result: T; provider: AiProvider }> {
  let lastError: unknown = null;

  for (let index = 0; index < providers.length; index += 1) {
    if (signal?.aborted) throw new Error('AI provider run was aborted by its time budget');
    const provider = providers[index]!;
    try {
      const result = await run(provider);
      return { result, provider };
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
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
    createGroqProvider(e.GROQ_API_KEY_2 ?? null, e.GROQ_MODEL, 'groq-2'),
    createGroqProvider(e.GROQ_API_KEY_3 ?? null, e.GROQ_MODEL, 'groq-3'),
    createOpenAiProvider(e.OPENAI_API_KEY ?? null, e.OPENAI_MODEL),
    createAnthropicProvider(e.ANTHROPIC_API_KEY ?? null, e.ANTHROPIC_MODEL),
  ]);
}
