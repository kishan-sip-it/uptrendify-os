import { describe, expect, it } from 'vitest';
import { normalizeTimezone } from './timezone';

describe('normalizeTimezone', () => {
  it('normalizes the legacy India alias', () => expect(normalizeTimezone('Asia/Calcutta')).toBe('Asia/Kolkata'));
  it('returns the canonical timezone unchanged', () => expect(normalizeTimezone('Asia/Kolkata')).toBe('Asia/Kolkata'));
  it('falls back safely for empty values', () => expect(normalizeTimezone('')).toBe('UTC'));
});
