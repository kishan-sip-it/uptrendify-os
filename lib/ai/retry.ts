import { AiProviderError } from './types';
import { obs } from '@/lib/obs/logger';

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 300;

export const TRANSIENT_PROVIDER_ERROR_PATTERNS = [
  'fetch failed',
  'ETIMEDOUT',
  'ECONNRESET',
  'ENOTFOUND',
  'AbortError',
  '503',
  '429',
  'UNAVAILABLE',
  'RESOURCE_EXHAUSTED',
  'high demand',
  'temporarily',
];

export function isTransientProviderError(error: unknown): boolean {
  if (error instanceof AiProviderError) {
    return error.status === 429 || error.status === 502 || error.status === 503;
  }
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_PROVIDER_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  label?: string;
  providerId?: string;
};

export async function withTransientRetry<T>(run: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const label = options.label ?? 'AI call';

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isTransientProviderError(error)) throw error;
      obs.info(`Retrying ${label} after transient provider error`, {
        provider: options.providerId,
        attempt,
        error: error instanceof Error ? error.message.slice(0, 300) : String(error),
      });
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}