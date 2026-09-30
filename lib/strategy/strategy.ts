import type { AiProvider, GenerateResult } from '@/lib/ai/types';
import { AiProviderError } from '@/lib/ai/types';
import {
  isStrategyValidationError,
  strategySchema,
  StrategyValidationError,
  STRATEGY_MAX_TOKENS,
  type StrategyOutput,
} from './schema';
import { buildStrategyPrompt, buildStrategyRepairPrompt } from './prompt';

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fence) return fence[1].trim();
  return trimmed;
}

export function parseStrategy(text: string): StrategyOutput {
  let raw: unknown;
  try {
    raw = JSON.parse(stripMarkdownFences(text));
  } catch {
    throw new StrategyValidationError('AI output was not valid JSON');
  }
  const parsed = strategySchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
    throw new StrategyValidationError(`AI output failed validation: ${issues}`);
  }
  return parsed.data;
}

export type StrategyExtractionOutcome = {
  result: StrategyOutput;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

function isJsonModeGenerationFailure(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError
    && error.status === 400
    && /generate json|failed_generation/i.test(error.message);
}

export async function extractStrategy(
  provider: AiProvider,
  contextText: string,
  model?: string,
): Promise<StrategyExtractionOutcome> {
  const prompt = buildStrategyPrompt(contextText);
  const input: Parameters<AiProvider['generate']>[0] = {
    prompt,
    system: 'You are a senior growth strategist who produces disciplined, evidence-based marketing strategies. You return strict JSON only.',
    json: true,
    maxTokens: STRATEGY_MAX_TOKENS,
    temperature: 0.3,
    ...(model ? { model } : {}),
  };

  const attempt = async (promptText: string, jsonMode = true): Promise<GenerateResult> => provider.generate({ ...input, prompt: promptText, json: jsonMode });

  let first: GenerateResult;
  let jsonMode = true;
  try {
    first = await attempt(prompt, true);
  } catch (error) {
    if (!isJsonModeGenerationFailure(error)) throw error;

    // Some provider/model combinations can reject JSON object mode with a 400
    // even though the same prompt succeeds as plain text. Keep the strict
    // application-side parser and schema validation, but retry once without
    // provider-side JSON enforcement so a provider formatting quirk cannot
    // strand strategy generation.
    jsonMode = false;
    first = await attempt(
      `${prompt}\n\nIf provider-side JSON mode is unavailable, still return ONLY the same valid JSON object as plain text. Do not add markdown or commentary.`,
      false,
    );
  }

  try {
    const result = parseStrategy(first.text);
    return { result, model: first.model, usage: first.usage };
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    const validationMessage = error instanceof Error ? error.message : 'invalid response';

    let second: GenerateResult;
    try {
      second = await attempt(buildStrategyRepairPrompt(prompt, validationMessage, first.text), jsonMode);
    } catch (repairError) {
      if (repairError instanceof AiProviderError) throw repairError;
      throw new StrategyValidationError('AI output was invalid and the repair attempt failed');
    }

    const safe = parseStrategy(second.text);
    return { result: safe, model: second.model, usage: second.usage };
  }
}

export { isStrategyValidationError };