import { describe, it, expect } from 'vitest';
import { assertResolvablePublicHost, readBoundedBody } from './url-security';

describe('assertResolvablePublicHost', () => {
  it('rejects localhost (resolves to loopback 127.0.0.1)', async () => {
    await expect(assertResolvablePublicHost('localhost')).rejects.toThrow('non-public address');
  });

  it('rejects hostnames that resolve to private ranges', async () => {
    await expect(assertResolvablePublicHost('0.0.0.0')).rejects.toThrow();
    await expect(assertResolvablePublicHost('127.0.0.1')).rejects.toThrow();
    await expect(assertResolvablePublicHost('10.0.0.1')).rejects.toThrow();
  });
});

describe('readBoundedBody', () => {
  it('returns full content within byte limit', async () => {
    const body = new TextEncoder().encode('Hello, world!');
    const response = new Response(body);
    const { content, truncated } = await readBoundedBody(response, 1000);
    expect(content).toBe('Hello, world!');
    expect(truncated).toBe(false);
  });

  it('truncates when body exceeds maxBytes', async () => {
    const body = new TextEncoder().encode('a'.repeat(500));
    const response = new Response(body);
    const { truncated } = await readBoundedBody(response, 100);
    expect(truncated).toBe(true);
  });

  it('handles responses with null body', async () => {
    const response = new Response(null);
    const { content, truncated } = await readBoundedBody(response, 1000);
    expect(content).toBe('');
    expect(truncated).toBe(false);
  });
});