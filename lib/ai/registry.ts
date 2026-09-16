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
    const preferred = this.providers.get(this.defaultId);
    if (preferred?.configured()) return preferred;
    return this.configured()[0] ?? preferred ?? null;
  }

  async health(): Promise<ProviderHealth[]> {
    return Promise.all(this.list().map((provider) => provider.health()));
  }
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