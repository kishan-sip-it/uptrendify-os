/**
 * Shared wall-clock budget for website-first Brand IQ extraction.
 * Vercel's route ceiling is 45 seconds. Stop at 40 seconds and reserve time
 * for response serialization, platform overhead, and a useful error response.
 */
export const WEBSITE_SCAN_BUDGET_MS = 40_000;
export const WEBSITE_SCAN_RESPONSE_RESERVE_MS = 4_000;
export const WEBSITE_SCAN_AI_BUDGET_MS = 22_000;

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
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(requestedMs) || requestedMs <= 0 || elapsedMs >= 32_000) return 0;
  return Math.max(0, Math.min(requestedMs, 32_000 - Math.max(0, elapsedMs)));
}
export function optionalResearchPageLimit(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs >= 25_000) return 0;
  if (elapsedMs >= 18_000) return 2;
  return 4;
}
export function aiEnrichmentBudgetMs(elapsedMs: number): number {
  return Math.min(WEBSITE_SCAN_AI_BUDGET_MS, remainingWebsiteScanBudgetMs(elapsedMs));
}
