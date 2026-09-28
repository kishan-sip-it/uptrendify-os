import { describe, expect, it } from 'vitest';
import {
  isLowSignalResearchPath,
  isResearchCandidate,
  isTrackingRedirectUrl,
  normalizeResearchUrl,
  sameResearchSite,
  unwrapRedirectUrl,
} from './url-policy';

describe('research URL policy', () => {
  it('unwraps known tracking redirects', () => {
    const wrapped = 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.instagram.com%2F&h=test';
    expect(unwrapRedirectUrl(wrapped)).toBe('https://www.instagram.com/');
    expect(normalizeResearchUrl(wrapped)).toBe('https://www.instagram.com/');
    expect(isTrackingRedirectUrl(wrapped)).toBe(true);
  });

  it('preserves safe apex-to-www research relationships', () => {
    expect(sameResearchSite('https://zoro.com', 'https://www.zoro.com/catalog')).toBe(true);
    expect(isResearchCandidate('https://zoro.com', 'https://www.zoro.com/catalog')).toBe(true);
    expect(isResearchCandidate('https://zoro.com', 'https://evil-zoro.com')).toBe(false);
  });

  it('filters authentication and account paths from research crawling', () => {
    expect(isLowSignalResearchPath('https://facebook.com/login/')).toBe(true);
    expect(isLowSignalResearchPath('https://facebook.com/about')).toBe(false);
    expect(isResearchCandidate('https://facebook.com', 'https://facebook.com/login/')).toBe(false);
  });

  it('removes marketing tracking parameters from stored research URLs', () => {
    expect(normalizeResearchUrl('https://example.com/about?utm_source=x&utm_medium=y&gclid=test#section'))
      .toBe('https://example.com/about');
  });
});
