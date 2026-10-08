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

    const send = async (model: string, maxTokens = input.maxTokens): Promise<GenerateResult> => {
      const useBrowserSearch = input.webSearch === true;
      if (useBrowserSearch && input.json) {
        throw new AiProviderError(id, 'Web search cannot be combined with structured JSON output', 400);
      }
      if (useBrowserSearch && (id !== 'groq' || !/^openai\/gpt-oss-(?:20b|120b)$/.test(model))) {
        throw new AiProviderError(id, 'This provider/model does not support browser search', 503);
      }

      const body = {
        model,
        messages: [
          ...(input.system ? [{ role: 'system', content: input.system }] : []),
          { role: 'user', content: input.prompt },
        ],
        ...(!useBrowserSearch && input.json ? { response_format: { type: 'json_object' } } : {}),
        ...(maxTokens
          ? model.startsWith('openai/gpt-oss-')
            ? { max_completion_tokens: maxTokens }
            : { max_tokens: maxTokens }
          : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(model.startsWith('openai/gpt-oss-')
          ? { include_reasoning: false, reasoning_effort: 'low' }
          : {}),
        ...(useBrowserSearch
          ? {
              citation_options: 'enabled',
              tool_choice: 'required',
              tools: [{ type: 'browser_search' }],
            }
          : {}),
      };

      const data = await postJson(`${baseUrl}/chat/completions`, {
        provider: id,
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
    };

    const model = input.model ?? defaultModel;
    try {
      return await send(model);
    } catch (error) {
      // Keep GPT-OSS 120B as the quality-first default. When its Groq model
      // bucket is rate-limited, a single bounded 20B fallback keeps the task
      // truthful and usable without inventing another provider.
      if (
        id === 'groq' &&
        model === 'openai/gpt-oss-120b' &&
        error instanceof AiProviderError &&
        error.status === 429
      ) {
        return send('openai/gpt-oss-20b', Math.min(input.maxTokens ?? 1200, 1200));
      }
      throw error;
    }
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