type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function arrayItemKey(value: unknown): string {
  if (!isRecord(value)) return typeof value + ':' + String(value);
  if (typeof value.claim === 'string' && typeof value.sourceUrl === 'string') {
    return 'evidence:' + value.claim + '|' + value.sourceUrl;
  }
  for (const key of ['hex', 'family', 'url', 'canonicalUrl', 'canonical_url', 'id', 'field', 'platform', 'name']) {
    if (typeof value[key] === 'string' && (value[key] as string).trim()) {
      return key + ':' + (value[key] as string).trim().toLowerCase();
    }
  }
  return 'json:' + JSON.stringify(value);
}

/**
 * Merge a fresh scan into saved brand data without erasing existing values.
 * Scalars already set on the brand remain authoritative; arrays accumulate
 * distinct evidence; missing or empty scanned values never clear stored data.
 */
export function mergeScanMetadata<T>(existing: T, incoming: unknown, key?: string): T {
  if (!hasValue(incoming)) return existing;
  if (!hasValue(existing)) return incoming as T;

  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const merged = [...existing];
    for (const item of incoming) {
      const itemKey = arrayItemKey(item);
      const index = merged.findIndex((previous) => arrayItemKey(previous) === itemKey);
      if (index === -1) merged.push(item);
      else merged[index] = mergeScanMetadata(merged[index], item);
    }
    return merged as T;
  }

  if (isRecord(existing) && isRecord(incoming)) {
    const result: JsonRecord = { ...existing };
    for (const [entryKey, nextValue] of Object.entries(incoming)) {
      if (!hasValue(nextValue)) continue;
      if (entryKey === 'detectedAt') {
        // Keep scan freshness accurate while preserving all other saved fields.
        result[entryKey] = nextValue;
      } else if (entryKey === 'pageCount' || entryKey === 'stylesheetCount') {
        const previous = result[entryKey];
        result[entryKey] = Math.max(typeof previous === 'number' ? previous : 0, typeof nextValue === 'number' ? nextValue : 0);
      } else if (!hasValue(result[entryKey])) {
        result[entryKey] = nextValue;
      } else {
        result[entryKey] = mergeScanMetadata(result[entryKey], nextValue, entryKey);
      }
    }
    return result as T;
  }

  return existing;
}

/** Build a camelCase PATCH payload from the current row before importing a repeat scan. */
export function mergeExistingBrandScanPatch(
  existingBrand: unknown,
  incomingPatch: JsonRecord,
): JsonRecord {
  if (!isRecord(existingBrand)) return incomingPatch;
  const existingPatch: JsonRecord = {
    description: existingBrand.description,
    primaryColor: existingBrand.primary_color,
    secondaryColors: existingBrand.secondary_colors,
    industry: existingBrand.industry,
    targetAudience: existingBrand.target_audience,
    positioning: existingBrand.positioning,
    offerDetails: existingBrand.offer_details,
    audienceDetails: existingBrand.audience_details,
    messaging: existingBrand.messaging,
    visualIdentity: existingBrand.visual_identity,
  };
  return mergeScanMetadata(existingPatch, incomingPatch);
}
