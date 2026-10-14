/**
 * Normalizes a website hostname so www.example.com and example.com are
 * treated as the same site during website-first brand import.
 */
export function normalizeWebsiteHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

/** Derives a readable fallback label from a public website URL. */
export function brandNameFromWebsiteUrl(rawUrl: string): string {
  try {
    const hostname = normalizeWebsiteHostname(new URL(rawUrl).hostname);
    const label = hostname.split('.')[0] || 'Brand';
    return label
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return 'Brand';
  }
}
