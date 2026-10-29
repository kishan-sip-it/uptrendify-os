/**
 * Curated families the Studio toolbar can apply. Web-font faces come from
 * the existing Google Fonts stylesheet; other entries rely on browser/OS font
 * matching and always include a generic fallback. The picker never accepts
 * arbitrary CSS strings.
 */
export type StudioFontFamilyOption = {
  value: string;
  label: string;
  category: 'Sans serif' | 'Serif' | 'Monospace';
  cssStack: string;
  weightSummary: string;
  styleSummary: string;
  source: 'Google Fonts' | 'System fonts';
};

export const STUDIO_FONT_FAMILIES: readonly StudioFontFamilyOption[] = [
  {
    value: 'Inter',
    label: 'Inter',
    category: 'Sans serif',
    cssStack: 'Inter, Arial, sans-serif',
    weightSummary: '400 Regular · 500 Medium · 600 Semibold · 700 Bold',
    styleSummary: 'Normal and italic',
    source: 'Google Fonts',
  },
  {
    value: 'Plus Jakarta Sans',
    label: 'Plus Jakarta Sans',
    category: 'Sans serif',
    cssStack: '"Plus Jakarta Sans", Inter, Arial, sans-serif',
    weightSummary: '400 Regular · 500 Medium · 600 Semibold · 700 Bold',
    styleSummary: 'Normal and italic',
    source: 'Google Fonts',
  },
  {
    value: 'Arial',
    label: 'Arial',
    category: 'Sans serif',
    cssStack: 'Arial, Helvetica, sans-serif',
    weightSummary: 'Regular and bold',
    styleSummary: 'Normal and italic where available',
    source: 'System fonts',
  },
  {
    value: 'Verdana',
    label: 'Verdana',
    category: 'Sans serif',
    cssStack: 'Verdana, Geneva, sans-serif',
    weightSummary: 'Regular and bold',
    styleSummary: 'Normal and italic where available',
    source: 'System fonts',
  },
  {
    value: 'Trebuchet MS',
    label: 'Trebuchet MS',
    category: 'Sans serif',
    cssStack: '"Trebuchet MS", Arial, sans-serif',
    weightSummary: 'Regular and bold',
    styleSummary: 'Normal and italic where available',
    source: 'System fonts',
  },
  {
    value: 'Georgia',
    label: 'Georgia',
    category: 'Serif',
    cssStack: 'Georgia, "Times New Roman", serif',
    weightSummary: 'Regular and bold',
    styleSummary: 'Normal and italic where available',
    source: 'System fonts',
  },
  {
    value: 'Times New Roman',
    label: 'Times New Roman',
    category: 'Serif',
    cssStack: '"Times New Roman", Times, serif',
    weightSummary: 'Regular and bold',
    styleSummary: 'Normal and italic where available',
    source: 'System fonts',
  },
  {
    value: 'Courier New',
    label: 'Courier New',
    category: 'Monospace',
    cssStack: '"Courier New", Courier, monospace',
    weightSummary: 'Regular and bold',
    styleSummary: 'Normal and italic where available',
    source: 'System fonts',
  },
  {
    value: 'system-ui',
    label: 'System UI',
    category: 'Sans serif',
    cssStack: 'system-ui, sans-serif',
    weightSummary: 'Regular and bold',
    styleSummary: 'Normal and italic where available',
    source: 'System fonts',
  },
] as const;

export function getStudioFontFamilyOption(value?: string | null): StudioFontFamilyOption | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return STUDIO_FONT_FAMILIES.find((font) => font.value.toLowerCase() === normalized) ?? null;
}

/** Extract a single family name from an inline CSS family list. */
export function studioFontFamilyNameFromCss(value: string): string {
  const first = value.split(',')[0]?.trim() ?? '';
  return first.replace(/^(['"])(.*)\1$/, '$2').trim();
}

/**
 * Render stored family names safely and predictably. New picker values are
 * allowlisted; older/custom brand families remain usable as a quoted single
 * name with an explicit fallback instead of being trusted as CSS fragments.
 */
export function studioFontFamilyCssStack(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const option = getStudioFontFamilyOption(value);
  if (option) return option.cssStack;

  const name = studioFontFamilyNameFromCss(value.trim());
  if (!name || name.length > 120 || /[;{}<>\u0000-\u001f]/.test(name)) {
    return 'Inter, Arial, sans-serif';
  }
  const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}", Inter, Arial, sans-serif`;
}
