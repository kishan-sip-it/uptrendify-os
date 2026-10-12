/**
 * Shared time budgets for website-first brand analysis.
 *
 * Optional CSS, icons, child pages and AI enrichment must not be allowed to
 * consume Vercel's hard 45-second function limit before a useful identity can
 * be returned.
 */
export function shouldRetryHomepageForVisuals(
  elapsedMs: number,
  hasRenderedFallback: boolean,
  hasHtml: boolean,
  stylesheetCount: number,
): boolean {
  // A reader fallback already contains the public page text. Re-fetching the
  // blocked/slow homepage only to look for CSS repeats expensive work.
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
  // AI is required Brand IQ work, not optional visual enrichment. Allow it to
  // start late when needed, but stop by 38s so the route can still return JSON
  // before Vercel's 45s hard timeout.
  if (!Number.isFinite(elapsedMs) || elapsedMs >= 38_000) return 0;
  return Math.max(0, Math.min(8_000, 38_000 - Math.max(0, elapsedMs)));
}
