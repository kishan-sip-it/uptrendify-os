import type { AiProvider, GenerateResult } from '@/lib/ai/types';
import { AiProviderError } from '@/lib/ai/types';
import {
  CONTENT_GEN_MAX_TOKENS,
  ContentValidationError,
  isContentValidationError,
  parseContentGeneration,
  type ContentGeneration,
  type ContentIntentLike,
} from './schema';

export type ContentExtractionOutcome = {
  result: ContentGeneration;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

function providerError(error: unknown): boolean {
  return error instanceof AiProviderError;
}

/**
 * Runs the generation through the provider and structurally validates the output.
 * A validation miss triggers exactly one repair attempt (bounded, mirroring the
 * strategy engine). Invalid output is never returned as a success.
 */
export async function extractContent(
  provider: AiProvider,
  prompt: string,
  intent: Pick<ContentIntentLike, 'type' | 'channel'>,
  options: { promptForRepair?: (prompt: string, message: string, raw: string) => string } = {},
): Promise<ContentExtractionOutcome> {
  const input: Parameters<AiProvider['generate']>[0] = {
    prompt,
    system:
      'You are an expert B2B marketing copywriter who works exclusively from approved brand intelligence and an approved strategy. You return strict JSON only.',
    json: true,
    maxTokens: CONTENT_GEN_MAX_TOKENS,
    temperature: 0.5,
  };

  const attempt = async (promptText: string): Promise<GenerateResult> => provider.generate({ ...input, prompt: promptText });

  const first = await attempt(prompt);
  try {
    const result = parseContentGeneration(first.text, intent);
    return { result, model: first.model, usage: first.usage };
  } catch (error) {
    if (providerError(error)) throw error;
    const validationMessage = error instanceof Error ? error.message : 'invalid response';

    const repair = options.promptForRepair ? options.promptForRepair : defaultRepairPrompt;
    let second: GenerateResult;
    try {
      second = await attempt(repair(prompt, validationMessage, first.text));
    } catch (repairError) {
      if (providerError(repairError)) throw repairError;
      throw new ContentValidationError('AI output was invalid and the repair attempt failed');
    }

    const safe = parseContentGeneration(second.text, intent);
    return { result: safe, model: second.model, usage: second.usage };
  }
}

function defaultRepairPrompt(prompt: string, message: string, raw: string): string {
  return [
    prompt,
    '## REPAIR',
    `The previous output was rejected because: ${message}`,
    'Return corrected strict JSON matching the OUTPUT REQUIREMENTS exactly. Do not invent new facts.',
    'Raw rejected output:',
    raw.slice(0, 8_000),
  ].join('\n\n');
}

export { isContentValidationError };
export type { ContentValidationError };