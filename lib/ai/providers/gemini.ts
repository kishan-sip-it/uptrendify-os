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
      throw new AiProviderError(
        id,
        err instanceof Error ? err.message : 'Gemini generation failed',
        502,
      );
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