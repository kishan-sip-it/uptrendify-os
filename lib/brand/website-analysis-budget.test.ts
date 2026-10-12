import { describe, expect, it } from 'vitest';
import {
  aiEnrichmentBudgetMs,
  optionalAssetBudgetMs,
  optionalResearchPageLimit,
  shouldRetryHomepageForVisuals,
} from './website-analysis-budget';

describe('website analysis request budgets', () => {
  it('does not refetch a slow homepage after a reader has already recovered its text', () => {
    expect(shouldRetryHomepageForVisuals(8_000, true, false, 0)).toBe(false);
    expect(shouldRetryHomepageForVisuals(8_000, false, true, 1)).toBe(false);
    expect(shouldRetryHomepageForVisuals(8_000, false, true, 0)).toBe(true);
    expect(shouldRetryHomepageForVisuals(12_000, false, true, 0)).toBe(false);
  });

  it('limits optional asset work to a shared 32-second budget', () => {
    expect(optionalAssetBudgetMs(5_000, 4_000)).toBe(4_000);
    expect(optionalAssetBudgetMs(30_000, 4_000)).toBe(2_000);
    expect(optionalAssetBudgetMs(32_000, 4_000)).toBe(0);
  });

  it('reduces child page crawl as recovery consumes the request budget', () => {
    expect(optionalResearchPageLimit(10_000)).toBe(4);
    expect(optionalResearchPageLimit(20_000)).toBe(2);
    expect(optionalResearchPageLimit(25_000)).toBe(0);
  });

  it('gives structured AI enough time while reserving a response buffer', () => {
    expect(aiEnrichmentBudgetMs(10_000)).toBe(18_000);
    expect(aiEnrichmentBudgetMs(20_000)).toBe(14_000);
    expect(aiEnrichmentBudgetMs(28_000)).toBe(6_000);
    expect(aiEnrichmentBudgetMs(33_999)).toBe(1);
    expect(aiEnrichmentBudgetMs(34_000)).toBe(0);
  });
});
