import type { AiProvider, GenerateInput, GenerateResult, ProviderHealth } from '../types';
import { AiProviderError } from '../types';
import { postJson } from '../http';

export function createOpenAiCompatibleProvider(
  id: string,
  baseUrl: string,
  apiKey: string | null,
  defaultModel: string,
): AiProvider {
  async function generate(input: GenerateInput): Promise<GenerateResult> {
    if (!apiKey) throw new AiProviderError(id, `${id} API key is not configured`, 503);
    const model = input.model ?? defaultModel;
    const body = {
      model,
      messages: [
        ...(input.system ? [{ role: 'system', content: input.system }] : []),
        { role: 'user', content: input.prompt },
      ],
      ...(input.json ? { response_format: { type: 'json_object' } } : {}),
      ...(input.maxTokens
        ? model.startsWith('openai/gpt-oss-')
          ? { max_completion_tokens: input.maxTokens }
          : { max_tokens: input.maxTokens }
        : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(model.startsWith('openai/gpt-oss-')
        ? { include_reasoning: false, reasoning_effort: 'low' }
        : {}),
    };

    const data = await postJson(`${baseUrl}/chat/completions`, {
      headers: { authorization: `Bearer ${apiKey}` },
      body,
    });

    const choice = data?.choices?.[0];
    if (!choice?.message?.content) {
      throw new AiProviderError(id, `${id} returned no completion`, 502);
    }

    return {
      text: String(choice.message.content).trim(),
      model,
      usage: {
        inputTokens: data?.usage?.prompt_tokens,
        outputTokens: data?.usage?.completion_tokens,
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

export function createGroqProvider(apiKey: string | null, defaultModel: string): AiProvider {
  return createOpenAiCompatibleProvider('groq', 'https://api.groq.com/openai/v1', apiKey, defaultModel);
}

export function createOpenAiProvider(apiKey: string | null, defaultModel: string): AiProvider {
  return createOpenAiCompatibleProvider('openai', 'https://api.openai.com/v1', apiKey, defaultModel);
}