import { describe, expect, it } from 'vitest';
import {
  getStudioFontFamilyOption,
  getStudioFontWeightOptions,
  nearestStudioFontWeight,
  STUDIO_FONT_FAMILIES,
  studioFontFamilyCssStack,
  studioFontFamilyNameFromCss,
} from './font-families';
import { contentDocBlockSchema } from '@/lib/content/document';

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

  it('limits selectable weights to each family and chooses the closest supported fallback', () => {
    expect(getStudioFontWeightOptions().map((weight) => weight.value)).toEqual([400, 500, 600, 700]);
    expect(getStudioFontWeightOptions('Inter').map((weight) => weight.value)).toEqual([400, 500, 600, 700]);
    expect(getStudioFontWeightOptions('Plus Jakarta Sans').map((weight) => weight.value)).toEqual([400, 500, 600, 700]);
    expect(getStudioFontWeightOptions('Arial').map((weight) => weight.value)).toEqual([400, 700]);
    expect(nearestStudioFontWeight('Arial', 500)).toBe(400);
    expect(nearestStudioFontWeight('Arial', 600)).toBe(700);
  });

  it('round-trips a validated numeric weight on block text and inline runs', () => {
    const parsed = contentDocBlockSchema.parse({
      id: 'font-weight-test',
      type: 'text',
      text: 'Mixed weight',
      fontWeight: 600,
      richText: [{ text: 'Mixed', fontWeight: 500 }, { text: ' weight', fontWeight: 700 }],
    });
    expect(parsed.type === 'text' && parsed.fontWeight).toBe(600);
    expect(parsed.type === 'text' && parsed.richText?.map((run) => run.fontWeight)).toEqual([500, 700]);
    expect(contentDocBlockSchema.safeParse({
      id: 'font-weight-invalid',
      type: 'text',
      text: 'Invalid weight',
      fontWeight: 450,
    }).success).toBe(false);
  });
});
