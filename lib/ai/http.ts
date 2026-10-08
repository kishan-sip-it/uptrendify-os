import { AiProviderError } from './types';

export async function postJson(
  url: string,
  { headers = {}, body, timeoutMs = 30_000, provider = 'http' }: { headers?: Record<string, string>; body: unknown; timeoutMs?: number; provider?: string },
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    throw new AiProviderError('http', `Provider request failed: ${cause instanceof Error ? cause.message : String(cause)}`, 0);
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text().catch(() => '');
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

  if (!response.ok) {
    const detail = data?.error?.message ?? data?.error ?? raw.slice(0, 200);
    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfterMs = retryAfterHeader && /^\d+(?:\.\d+)?$/.test(retryAfterHeader)
      ? Math.ceil(Number(retryAfterHeader) * 1000)
      : undefined;
    const retryAfterText = typeof detail === 'string'
      ? detail.match(/(?:try again|retry)(?: in)?\s+(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|seconds)?/i)
      : null;
    const retryAfterFromBodyMs = retryAfterText
      ? Number(retryAfterText[1]) * (retryAfterText[2]?.toLowerCase() === 'ms' ? 1 : 1000)
      : undefined;
    const effectiveRetryAfterMs = retryAfterMs ?? retryAfterFromBodyMs;
    throw new AiProviderError(provider, `Provider returned ${response.status}: ${detail}`, response.status, effectiveRetryAfterMs);
  }
  return data;
}