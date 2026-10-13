import { describe, expect, it } from 'vitest';
import {
  aiEnrichmentBudgetMs, optionalAssetBudgetMs, optionalResearchPageLimit,
  remainingWebsiteScanBudgetMs, sharedWebsiteScanStageBudgetMs, shouldRetryHomepageForVisuals,
  WEBSITE_DNS_VALIDATION_BUDGET_MS, WEBSITE_SCAN_BUDGET_MS, WEBSITE_SCAN_RESPONSE_RESERVE_MS,
} from './website-analysis-budget';

describe('website analysis shared deadline', () => {
  it('reserves response time before the platform timeout', () => {
    expect(WEBSITE_SCAN_BUDGET_MS).toBe(40_000);
    expect(WEBSITE_SCAN_RESPONSE_RESERVE_MS).toBe(4_000);
    expect(WEBSITE_DNS_VALIDATION_BUDGET_MS).toBe(14_000);
    expect(remainingWebsiteScanBudgetMs(0)).toBe(36_000);
    expect(remainingWebsiteScanBudgetMs(20_000)).toBe(16_000);
    expect(remainingWebsiteScanBudgetMs(36_000)).toBe(0);
    expect(sharedWebsiteScanStageBudgetMs(20_000, 14_000)).toBe(14_000);
    expect(sharedWebsiteScanStageBudgetMs(30_000, 9_000)).toBe(6_000);
    expect(sharedWebsiteScanStageBudgetMs(36_000, 9_000)).toBe(0);
  });
  it('does not retry a slow homepage after a reader recovered text', () => {
    expect(shouldRetryHomepageForVisuals(8_000, true, false, 0)).toBe(false);
    expect(shouldRetryHomepageForVisuals(8_000, false, true, 1)).toBe(false);
    expect(shouldRetryHomepageForVisuals(8_000, false, true, 0)).toBe(true);
    expect(shouldRetryHomepageForVisuals(12_000, false, true, 0)).toBe(false);
  });
  it('limits optional assets and reduces child crawls as time runs short', () => {
    expect(optionalAssetBudgetMs(5_000, 4_000)).toBe(4_000);
    expect(optionalAssetBudgetMs(30_000, 4_000)).toBe(2_000);
    expect(optionalAssetBudgetMs(32_000, 4_000)).toBe(0);
    expect(optionalResearchPageLimit(10_000)).toBe(4);
    expect(optionalResearchPageLimit(20_000)).toBe(2);
    expect(optionalResearchPageLimit(25_000)).toBe(0);
  });
  it('gives structured AI more time within the shared request deadline', () => {
    expect(aiEnrichmentBudgetMs(10_000)).toBe(22_000);
    expect(aiEnrichmentBudgetMs(20_000)).toBe(16_000);
    expect(aiEnrichmentBudgetMs(28_000)).toBe(8_000);
    expect(aiEnrichmentBudgetMs(33_000)).toBe(3_000);
    expect(aiEnrichmentBudgetMs(36_000)).toBe(0);
  });
});
