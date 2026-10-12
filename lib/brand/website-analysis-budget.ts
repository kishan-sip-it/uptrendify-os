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
  // Begin AI as soon as evidence pages are ready and let it run while optional
  // visual assets are inspected. Reserve 11 seconds before Vercel's 45s limit.
  if (!Number.isFinite(elapsedMs) || elapsedMs >= 34_000) return 0;
  return Math.max(0, Math.min(18_000, 34_000 - Math.max(0, elapsedMs)));
}
