import type { AiProvider, GenerateInput, GenerateResult, ProviderHealth } from '../types';
import { AiProviderError } from '../types';
import { postJson } from '../http';

const MAX_GROQ_RATE_LIMIT_WAIT_MS = 35_000;
const DEFAULT_GROQ_RATE_LIMIT_WAIT_MS = 1_500;

const GROQ_TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504, 520, 522, 524, 529]);

function isGroqTransientError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError && GROQ_TRANSIENT_STATUSES.has(error.status);
}

async function waitForGroqRateLimit(error: AiProviderError): Promise<void> {
  const requested = error.retryAfterMs ?? DEFAULT_GROQ_RATE_LIMIT_WAIT_MS;
  const delay = Math.max(250, Math.min(MAX_GROQ_RATE_LIMIT_WAIT_MS, requested));
  await new Promise((resolve) => setTimeout(resolve, delay));
}

function groqFallbackTokenBudget(input: GenerateInput): number | undefined {
  if (input.maxTokens === undefined) return undefined;
  // Keep structured strategy/brain outputs large enough to validate. The old
  // flat 1,200-token fallback frequently truncated JSON for larger tasks.
  return Math.min(input.maxTokens, 4_096);
}

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
              tool_choice: 'required',
              tools: [{ type: 'browser_search' }],
            }
          : {}),
      };

      const data = await postJson(`${baseUrl}/chat/completions`, {
        provider: id,
        headers: { authorization: `Bearer ${apiKey}` },
        body,
        ...(input.signal ? { signal: input.signal } : {}),
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
      if (!id.startsWith('groq') || !isGroqTransientError(error) || input.signal?.aborted) {
        throw error;
      }

      // Try the smaller supported model after a rate-limit OR a transient upstream
      // outage. Keep this inside the same provider budget; never sleep on scan paths.
      if (model === 'openai/gpt-oss-120b') {
        const fallbackTokens = groqFallbackTokenBudget(input);
        try {
          return await send('openai/gpt-oss-20b', fallbackTokens);
        } catch (fallbackError) {
          if (!isGroqTransientError(fallbackError) || input.signal?.aborted) {
            throw fallbackError;
          }
          // Do not sleep/retry an upstream outage, and never sleep through a scan deadline.
          if (fallbackError.status !== 429 || input.fastFail) throw fallbackError;
          await waitForGroqRateLimit(fallbackError);
          return send('openai/gpt-oss-20b', fallbackTokens);
        }
      }

      // If this request has a hard user-facing deadline, let provider failover
      // happen now rather than sleeping for a long Retry-After interval.
      // Only rate limits provide a useful retry delay. Other transient failures
      // should flow to the cross-provider registry without wasting the scan budget.
      if (input.fastFail || error.status !== 429 || input.signal?.aborted) throw error;
      await waitForGroqRateLimit(error);
      return send(model);
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

export function createGroqProvider(apiKey: string | null, defaultModel: string, providerId = 'groq'): AiProvider {
  return createOpenAiCompatibleProvider(providerId, 'https://api.groq.com/openai/v1', apiKey, defaultModel);
}

export function createOpenAiProvider(apiKey: string | null, defaultModel: string): AiProvider {
  return createOpenAiCompatibleProvider('openai', 'https://api.openai.com/v1', apiKey, defaultModel);
}