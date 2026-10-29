import { describe, expect, it } from 'vitest';
import {
  getStudioFontFamilyOption,
  STUDIO_FONT_FAMILIES,
  studioFontFamilyCssStack,
  studioFontFamilyNameFromCss,
} from './font-families';

describe('Studio font families', () => {
  it('offers a curated set of web and system font families', () => {
    expect(STUDIO_FONT_FAMILIES.map((font) => font.value)).toContain('Inter');
    expect(STUDIO_FONT_FAMILIES.map((font) => font.value)).toContain('Plus Jakarta Sans');
    expect(STUDIO_FONT_FAMILIES.length).toBeGreaterThanOrEqual(8);
    expect(getStudioFontFamilyOption('plus jakarta sans')?.value).toBe('Plus Jakarta Sans');
    expect(getStudioFontFamilyOption('not-a-picker-font')).toBeNull();
  });

  it('uses known stacks for picker families and predictable fallbacks for saved names', () => {
    expect(studioFontFamilyCssStack('Inter')).toBe('Inter, Arial, sans-serif');
    expect(studioFontFamilyCssStack('Plus Jakarta Sans')).toBe('"Plus Jakarta Sans", Inter, Arial, sans-serif');
    expect(studioFontFamilyCssStack('Custom Brand Font')).toBe('"Custom Brand Font", Inter, Arial, sans-serif');
  });

  it('rejects CSS fragments as font names and extracts one family from a saved stack', () => {
    expect(studioFontFamilyCssStack('x; color: red')).toBe('Inter, Arial, sans-serif');
    expect(studioFontFamilyNameFromCss('"Plus Jakarta Sans", Inter, Arial, sans-serif')).toBe('Plus Jakarta Sans');
    expect(studioFontFamilyNameFromCss('Georgia')).toBe('Georgia');
  });
});
