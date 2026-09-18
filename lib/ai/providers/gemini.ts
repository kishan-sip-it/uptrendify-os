import type { AiProvider, GenerateInput, GenerateResult, ProviderHealth } from '../types';
import { AiProviderError } from '../types';
import { generateGeminiJson, generateGeminiText } from '@/lib/ai/gemini';

export function createGeminiProvider(apiKey: string | null, defaultModel: string): AiProvider {
  const id = 'gemini';

  async function generate(input: GenerateInput): Promise<GenerateResult> {
    if (!apiKey) throw new AiProviderError(id, 'Gemini API key is not configured', 503);

    const options = {
      systemInstruction: input.system,
      temperature: input.temperature,
      maxOutputTokens: input.maxTokens,
    };

    try {
      const text = input.json
        ? JSON.stringify(
            await generateGeminiJson<unknown>(input.prompt, {
              ...options,
            }),
          )
        : await generateGeminiText(input.prompt, options);

      return { text, model: input.model ?? defaultModel };
    } catch (err) {
      if (err instanceof AiProviderError) throw err;
      const candidate = err as { status?: unknown; statusCode?: unknown; code?: unknown };
      const numericStatus =
        typeof candidate.status === 'number' ? candidate.status :
        typeof candidate.statusCode === 'number' ? candidate.statusCode :
        typeof candidate.code === 'number' ? candidate.code :
        undefined;
      const message = err instanceof Error ? err.message : 'Gemini generation failed';
      const match = /(?:status|code)[^0-9]{0,12}(401|403|429|500|502|503|504)\b/i.exec(message);
      const status = numericStatus ?? (match ? Number(match[1]) : 502);
      throw new AiProviderError(id, message, status);
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