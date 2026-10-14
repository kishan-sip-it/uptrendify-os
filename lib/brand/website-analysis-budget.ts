/**
 * Shared wall-clock budget for website-first Brand IQ extraction.
 * The route allows 90 seconds, reserving the final 8 seconds for response
 * serialization and platform overhead. Slow sites and provider failover should
 * not consume the whole deadline before structured extraction can complete.
 */
export const WEBSITE_SCAN_BUDGET_MS = 80_000;
export const WEBSITE_SCAN_RESPONSE_RESERVE_MS = 8_000;
export const WEBSITE_SCAN_AI_BUDGET_MS = 48_000;
// Allow the bounded system resolver retries plus an alternate A/AAAA record lookup.
export const WEBSITE_DNS_VALIDATION_BUDGET_MS = 14_000;

export function remainingWebsiteScanBudgetMs(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  return Math.max(0, WEBSITE_SCAN_BUDGET_MS - elapsedMs - WEBSITE_SCAN_RESPONSE_RESERVE_MS);
}
export function sharedWebsiteScanStageBudgetMs(elapsedMs: number, requestedMs: number): number {
  if (!Number.isFinite(requestedMs) || requestedMs <= 0) return 0;
  return Math.max(0, Math.min(requestedMs, remainingWebsiteScanBudgetMs(elapsedMs)));
}
export function shouldRetryHomepageForVisuals(elapsedMs: number, hasRenderedFallback: boolean, hasHtml: boolean, stylesheetCount: number): boolean {
  return elapsedMs < 12_000 && !hasRenderedFallback && hasHtml && stylesheetCount === 0;
}
export function optionalAssetBudgetMs(elapsedMs: number, requestedMs: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(requestedMs) || requestedMs <= 0 || elapsedMs >= 58_000) return 0;
  return Math.max(0, Math.min(requestedMs, 58_000 - Math.max(0, elapsedMs)));
}
export function optionalResearchPageLimit(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs >= 48_000) return 0;
  if (elapsedMs >= 36_000) return 1;
  if (elapsedMs >= 24_000) return 2;
  return 4;
}
export function aiEnrichmentBudgetMs(elapsedMs: number): number {
  return Math.min(WEBSITE_SCAN_AI_BUDGET_MS, remainingWebsiteScanBudgetMs(elapsedMs));
}
