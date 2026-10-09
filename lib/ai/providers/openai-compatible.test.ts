import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../http', () => ({
  postJson: vi.fn(),
}));

import { postJson } from '../http';
import { createGroqProvider } from './openai-compatible';
import { AiProviderError } from '../types';

const mockedPostJson = vi.mocked(postJson);

describe('createGroqProvider', () => {
  beforeEach(() => {
    mockedPostJson.mockReset();
  });

  it('falls back once from GPT-OSS 120B to 20B after a 429', async () => {
    mockedPostJson
      .mockRejectedValueOnce(new AiProviderError('groq', 'rate limited', 429, 7000))
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

    const provider = createGroqProvider('test-key', 'openai/gpt-oss-120b');
    const result = await provider.generate({
      prompt: 'Return JSON.',
      json: true,
      maxTokens: 1500,
      model: 'openai/gpt-oss-120b',
    });

    expect(result.model).toBe('openai/gpt-oss-20b');
    expect(result.text).toBe('{"ok":true}');
    expect(mockedPostJson).toHaveBeenCalledTimes(2);

    const firstBody = mockedPostJson.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    const secondBody = mockedPostJson.mock.calls[1]?.[1]?.body as Record<string, unknown>;

    expect(firstBody.model).toBe('openai/gpt-oss-120b');
    expect(secondBody.model).toBe('openai/gpt-oss-20b');
    expect(secondBody.max_completion_tokens).toBe(1500);
    expect(firstBody).not.toHaveProperty('service_tier');
    expect(secondBody).not.toHaveProperty('service_tier');
  });


  it('waits for Retry-After and retries 20B once when both models are rate-limited', async () => {
    vi.useFakeTimers();
    try {
      mockedPostJson
        .mockRejectedValueOnce(new AiProviderError('groq', '120B rate limited', 429, 100))
        .mockRejectedValueOnce(new AiProviderError('groq', '20B rate limited', 429, 100))
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
          usage: { prompt_tokens: 100, completion_tokens: 200 },
        });

      const provider = createGroqProvider('test-key', 'openai/gpt-oss-120b');
      const pending = provider.generate({
        prompt: 'Create a full strategy object.',
        json: true,
        maxTokens: 8192,
        model: 'openai/gpt-oss-120b',
      });
      await vi.advanceTimersByTimeAsync(100);
      const result = await pending;

      expect(result.model).toBe('openai/gpt-oss-20b');
      expect(mockedPostJson).toHaveBeenCalledTimes(3);
      const fallbackBody = mockedPostJson.mock.calls[1]?.[1]?.body as Record<string, unknown>;
      const retryBody = mockedPostJson.mock.calls[2]?.[1]?.body as Record<string, unknown>;
      expect(fallbackBody.model).toBe('openai/gpt-oss-20b');
      expect(fallbackBody.max_completion_tokens).toBe(4096);
      expect(retryBody).toEqual(fallbackBody);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses Groq browser search only in plain-text mode', async () => {
    mockedPostJson.mockResolvedValueOnce({
      choices: [{ message: { content: 'https://example.com/about' } }],
      usage: { prompt_tokens: 20, completion_tokens: 30 },
    });

    const provider = createGroqProvider('test-key', 'openai/gpt-oss-120b');
    const result = await provider.generate({
      prompt: 'Find relevant public URLs.',
      model: 'openai/gpt-oss-120b',
      maxTokens: 900,
      temperature: 0.1,
      webSearch: true,
    });

    expect(result.text).toContain('https://example.com/about');
    const body = mockedPostJson.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('response_format');
    expect(body.tool_choice).toBe('required');
    expect(body.tools).toEqual([{ type: 'browser_search' }]);
    expect(body).not.toHaveProperty('service_tier');
  });

  it('does not change the requested model after non-rate-limit errors', async () => {
    mockedPostJson.mockRejectedValueOnce(new AiProviderError('groq', 'bad request', 400));

    const provider = createGroqProvider('test-key', 'openai/gpt-oss-120b');
    await expect(provider.generate({
      prompt: 'Return JSON.',
      json: true,
      maxTokens: 1000,
      model: 'openai/gpt-oss-120b',
    })).rejects.toThrow('bad request');

    expect(mockedPostJson).toHaveBeenCalledTimes(1);
  });
});
