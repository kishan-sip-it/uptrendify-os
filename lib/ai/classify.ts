import { AiProviderError } from '@/lib/ai/types';
import { isTransientProviderError } from '@/lib/ai/retry';

export type ProviderFailureCode =
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'PROVIDER_UNCONFIGURED'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export interface ProviderFailure {
  code: ProviderFailureCode;
  retryable: boolean;
  actionable: boolean;
  message: string;
}

const NETWORK_MARKERS = [
  'fetch failed',
  'etimedout',
  'econnreset',
  'econnrefused',
  'enotfound',
  'socket hang up',
  'aborted',
  'network',
];
const AUTH_MARKERS = ['401', '403', 'api key', 'unauthorized', 'authentication', 'permission'];
const UNCONFIGURED_MARKERS = ['not configured', 'unconfigured', 'no api key', 'unset', 'missinguang'];

function failure(code: ProviderFailureCode, retryable: boolean, actionable: boolean, message: string): ProviderFailure {
  return { code, retryable, actionable, message: message.slice(0, 240) };
}

export function classifyProviderFailure(error: unknown): ProviderFailure {
  if (error instanceof AiProviderError) {
    if (error.status === 401 || error.status === 403) {
      return failure('AUTHENTICATION_ERROR', false, true, 'Provider rejected the configured credentials.');
    }
    if (error.status === 429) {
      return failure('RATE_LIMITED', true, false, 'Provider is rate-limiting requests. Retrying with backoff.');
    }
    if (error.status === 502 || error.status === 503 || error.status === 504) {
      return failure('SERVICE_UNAVAILABLE', true, false, 'Provider is temporarily unavailable. Retrying with backoff.');
    }
    if (error.status === 400 || error.status === 422) {
      return failure('VALIDATION_ERROR', false, false, 'Provider rejected the request as invalid. Fix the input and retry.');
    }
    return failure('UNKNOWN', false, false, error.message.slice(0, 240));
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (UNCONFIGURED_MARKERS.some((m) => lower.includes(m))) {
    return failure('PROVIDER_UNCONFIGURED', false, true, 'No AI provider is configured with valid credentials.');
  }
  if (AUTH_MARKERS.some((m) => lower.includes(m))) {
    return failure('AUTHENTICATION_ERROR', false, true, 'Provider rejected the request due to invalid credentials or permissions.');
  }
  if (NETWORK_MARKERS.some((m) => lower.includes(m))) {
    return failure('NETWORK_ERROR', true, false, 'Could not reach the AI provider. Retrying with backoff.');
  }
  if (isTransientProviderError(error)) {
    return failure('SERVICE_UNAVAILABLE', true, false, 'Provider reported a transient failure. Retrying with backoff.');
  }
  return failure('UNKNOWN', false, false, message.slice(0, 240));
}

export function isRetryableProviderFailure(error: unknown): boolean {
  return classifyProviderFailure(error).retryable;
}
