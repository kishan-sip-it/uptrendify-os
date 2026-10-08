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
    const retryAfterSeconds = response.headers.get('retry-after');
    const retryAfterMs = retryAfterSeconds && /^\d+(?:\.\d+)?$/.test(retryAfterSeconds)
      ? Math.ceil(Number(retryAfterSeconds) * 1000)
      : undefined;
    throw new AiProviderError(provider, `Provider returned ${response.status}: ${detail}`, response.status, retryAfterMs);
  }
  return data;
}