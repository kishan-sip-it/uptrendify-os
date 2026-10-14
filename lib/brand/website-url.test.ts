import { describe, expect, it } from 'vitest';
import { brandNameFromWebsiteUrl, normalizeWebsiteHostname } from './website-url';

describe('website URL normalization for brand import', () => {
  it('normalizes www and non-www hostnames to the same host', () => {
    expect(normalizeWebsiteHostname('WWW.Salesforce.com')).toBe('salesforce.com');
    expect(normalizeWebsiteHostname('salesforce.com')).toBe('salesforce.com');
  });

  it('removes a trailing DNS dot', () => {
    expect(normalizeWebsiteHostname('www.salesforce.com.')).toBe('salesforce.com');
  });

  it('builds a readable fallback brand name from www URLs', () => {
    expect(brandNameFromWebsiteUrl('https://www.salesforce.com/in/')).toBe('Salesforce');
    expect(brandNameFromWebsiteUrl('https://www.north-star.co/')).toBe('North Star');
  });

  it('returns a safe fallback for malformed URLs', () => {
    expect(brandNameFromWebsiteUrl('not a url')).toBe('Brand');
  });
});
