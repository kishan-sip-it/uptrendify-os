import { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_COUNTS, TEMPLATE_TOTAL, type TemplateCategoryId, type TemplateDefinition } from './types';
import { SOCIAL_TEMPLATES } from './catalog/social';
import { MARKETING_TEMPLATES } from './catalog/marketing';
import { BRAND_TEMPLATES } from './catalog/brand';
import { ECOMMERCE_TEMPLATES } from './catalog/ecommerce';
import { PRESENTATION_TEMPLATES } from './catalog/presentation';
import { EVENT_TEMPLATES } from './catalog/events';
import { EDUCATION_TEMPLATES } from './catalog/education';
import { EDITORIAL_TEMPLATES } from './catalog/editorial';
import { INFOGRAPHIC_TEMPLATES } from './catalog/infographic';
import { DOCUMENT_TEMPLATES } from './catalog/documents';

export * from './types';

/** The bundled library: exactly TEMPLATE_TOTAL curated, original templates. */
export const STUDIO_LIBRARY: TemplateDefinition[] = [
  ...SOCIAL_TEMPLATES,
  ...MARKETING_TEMPLATES,
  ...BRAND_TEMPLATES,
  ...ECOMMERCE_TEMPLATES,
  ...PRESENTATION_TEMPLATES,
  ...EVENT_TEMPLATES,
  ...EDUCATION_TEMPLATES,
  ...EDITORIAL_TEMPLATES,
  ...INFOGRAPHIC_TEMPLATES,
  ...DOCUMENT_TEMPLATES,
];

export function libraryCountByCategory(): Record<TemplateCategoryId, number> {
  return Object.fromEntries(TEMPLATE_CATEGORIES.map((category) => [
    category.id,
    STUDIO_LIBRARY.filter((template) => template.category === category.id).length,
  ])) as Record<TemplateCategoryId, number>;
}

/** Fail fast when a category file drifts from the mission counts. */
export function assertLibraryIntegrity(): void {
  const counts = libraryCountByCategory();
  for (const category of TEMPLATE_CATEGORIES) {
    if (counts[category.id] !== TEMPLATE_CATEGORY_COUNTS[category.id]) {
      throw new Error(`Template library category "${category.id}" has ${counts[category.id]} templates, expected ${TEMPLATE_CATEGORY_COUNTS[category.id]}`);
    }
  }
  if (STUDIO_LIBRARY.length !== TEMPLATE_TOTAL) {
    throw new Error(`Template library has ${STUDIO_LIBRARY.length} templates, expected ${TEMPLATE_TOTAL}`);
  }
}
