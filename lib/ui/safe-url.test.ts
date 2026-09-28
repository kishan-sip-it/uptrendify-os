import { describe, expect, it } from 'vitest';
import { compactUrl, isRawUrlLabel } from './safe-url';

describe('safe URL rendering helpers', () => {
  it('compacts long URLs without losing the host', () => {
    const url = 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.instagram.com%2F&h=very-long-tracking-value';
    const result = compactUrl(url, 48);
    expect(result).toContain('l.facebook.com');
    expect(result.length).toBeLessThanOrEqual(48);
  });

  it('recognizes URL labels so titles never render giant URLs as plain text', () => {
    expect(isRawUrlLabel('https://example.com/path')).toBe(true);
    expect(isRawUrlLabel('Example')).toBe(false);
    expect(isRawUrlLabel(null)).toBe(false);
  });
});
