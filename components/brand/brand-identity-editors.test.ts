import { describe, it, expect } from 'vitest';
import { normaliseClearedText } from './brand-identity-editors';

/**
 * Regression coverage for the Brand information edit/clear persistence bug.
 *
 * The save path itself (UI state -> normalisation -> PATCH /api/brands/:id ->
 * Supabase -> response) was verified to persist correctly, so the user-visible
 * "it reverted to the old value" symptom came from the client continuing to
 * render pre-save data. These cases pin the normalisation that decides what a
 * clear actually sends, which is the part that must never fall back to the
 * previous value.
 */
describe('normaliseClearedText', () => {
  it('keeps an edited value and trims surrounding whitespace', () => {
    expect(normaliseClearedText('  New value  ')).toBe('New value');
  });

  it('turns an empty draft into an explicit clear (null), not an empty string', () => {
    expect(normaliseClearedText('')).toBeNull();
    expect(normaliseClearedText('   ')).toBeNull();
    expect(normaliseClearedText('\n\t ')).toBeNull();
  });

  it('passes an explicit null through as a clear', () => {
    expect(normaliseClearedText(null)).toBeNull();
    expect(normaliseClearedText(undefined)).toBeNull();
  });

  it('never resurrects a previous value when the draft is cleared', () => {
    // The cleared field must not be replaced by the stale value it had before.
    const staleValue = 'Discover Firebase, Google\u2019s mobile and web app platform';
    const draftAfterClear = '';
    const saved = normaliseClearedText(draftAfterClear);

    expect(saved).toBeNull();
    expect(saved).not.toBe(staleValue);
  });

  it('preserves multi-line values used by the multiline editors', () => {
    expect(normaliseClearedText('  line one\nline two  ')).toBe('line one\nline two');
  });
});
