import type { AiProvider, GenerateInput, GenerateResult, ProviderHealth } from '../types';
import { AiProviderError } from '../types';
import { postJson } from '../http';

const BASE = 'https://api.anthropic.com/v1';

export function createAnthropicProvider(apiKey: string | null, defaultModel: string): AiProvider {
  const id = 'anthropic';

  async function generate(input: GenerateInput): Promise<GenerateResult> {
    if (!apiKey) throw new AiProviderError(id, 'Anthropic API key is not configured', 503);
    const model = input.model ?? defaultModel;
    const body = {
      model,
      max_tokens: input.maxTokens ?? 1024,
      ...(input.system ? { system: input.system } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      messages: [{ role: 'user', content: input.prompt }],
    };

    const data = await postJson(`${BASE}/messages`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body,
    });

    const text = (data?.content ?? [])
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('')
      .trim();

    if (!text) throw new AiProviderError(id, 'Anthropic returned no text content', 502);

    return {
      text,
      model,
      usage: {
        inputTokens: data?.usage?.input_tokens,
        outputTokens: data?.usage?.output_tokens,
      },
    };
  }

  return {
    id,
    defaultModel,
    configured: () => Boolean(apiKey),
    generate,
    health: async (): Promise<ProviderHealth> => ({ id, configured: Boolean(apiKey), ok: Boolean(apiKey) }),
  };
}