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

  const attempt = async (promptText: string): Promise<GenerateResult> => provider.generate({ ...input, prompt: promptText });

  const first = await attempt(prompt);
  try {
    const result = parseStrategy(first.text);
    return { result, model: first.model, usage: first.usage };
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    const validationMessage = error instanceof Error ? error.message : 'invalid response';

    let second: GenerateResult;
    try {
      second = await attempt(buildStrategyRepairPrompt(prompt, validationMessage, first.text));
    } catch (repairError) {
      if (repairError instanceof AiProviderError) throw repairError;
      throw new StrategyValidationError('AI output was invalid and the repair attempt failed');
    }

    const safe = parseStrategy(second.text);
    return { result: safe, model: second.model, usage: second.usage };
  }
}

export { isStrategyValidationError };