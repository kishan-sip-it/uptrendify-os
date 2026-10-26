import type { ContentPageSizeId } from '@/lib/content/document';

/**
 * UpTrendifyOS Studio template library — curated, original, fully native.
 *
 * A TemplateDefinition is a declarative spec. `buildTemplateDocument`
 * (build.ts) turns it into a real schema-valid ContentDocument, so every
 * template is ordinary editable Studio content — no parallel renderer, no
 * screenshots. Geometry is authored in the page's own pixel space.
 */

export const TEMPLATE_CATEGORIES = [
  { id: 'social', label: 'Social & community', count: 110 },
  { id: 'marketing', label: 'Marketing & ads', count: 70 },
  { id: 'brand', label: 'Brand & business', count: 50 },
  { id: 'ecommerce', label: 'E-commerce & product', count: 60 },
  { id: 'presentation', label: 'Presentations & decks', count: 45 },
  { id: 'events', label: 'Events & launches', count: 40 },
  { id: 'education', label: 'Education & learning', count: 35 },
  { id: 'editorial', label: 'Editorial & content', count: 35 },
  { id: 'infographic', label: 'Infographics & data', count: 25 },
  { id: 'documents', label: 'Docs, proposals & career', count: 30 },
] as const;

export type TemplateCategoryId = (typeof TEMPLATE_CATEGORIES)[number]['id'];

export const TEMPLATE_CATEGORY_COUNTS: Record<TemplateCategoryId, number> = Object.fromEntries(
  TEMPLATE_CATEGORIES.map((category) => [category.id, category.count]),
) as Record<TemplateCategoryId, number>;

export const TEMPLATE_TOTAL = TEMPLATE_CATEGORIES.reduce((total, category) => total + category.count, 0);

/** Curated palette roles resolved at build time. A raw `#rrggbb` is also allowed. */
export type TemplateColorRole = 'ink' | 'accent' | 'accentText' | 'soft' | 'paper' | 'bg' | 'onAccent';

export type TemplatePalette = {
  name: string;
  bg: string;
  ink: string;
  accent: string;
  /** Accent-family colour guaranteed ≥4.5:1 on `bg` — used for small accent text. */
  accentText: string;
  /** Text colour used on top of an `accent` fill (white or ink, whichever reads). */
  onAccent: string;
  soft: string;
  paper: string;
};

/** Font keys map to system-safe families the editor offers (Design tab list). */
export type TemplateFontKey = 'sans' | 'display' | 'geometric' | 'humanist';

export const TEMPLATE_FONT_FAMILIES: Record<TemplateFontKey, string> = {
  sans: 'Arial',
  display: 'Georgia',
  geometric: 'Trebuchet MS',
  humanist: 'Verdana',
};

export type TemplateAlign = 'left' | 'center' | 'right';

export type TemplateGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
};

type TemplateBlockBase = TemplateGeometry & {
  /** Resolved palette role or an explicit #rrggbb colour. */
  color?: TemplateColorRole | string;
  opacity?: number;
};

export type TemplateTextSpec = TemplateBlockBase & {
  kind: 'heading' | 'text';
  text: string;
  level?: 1 | 2 | 3;
  fontSize?: number;
  align?: TemplateAlign;
  bg?: TemplateColorRole | string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  font?: TemplateFontKey;
};

export type TemplateButtonSpec = TemplateBlockBase & {
  kind: 'button';
  text: string;
  align?: TemplateAlign;
  font?: TemplateFontKey;
};

export type TemplateShapeSpec = TemplateBlockBase & {
  kind: 'shape';
  /** Native primitive shape. Mutually exclusive with `art`. */
  shape?: 'rectangle' | 'square' | 'circle' | 'triangle' | 'star' | 'pyramid';
  /** Identifier from the art library; rendered as an editable vector layer. */
  art?: string;
  /** Render the art in stroke mode instead of filled. */
  artStroke?: boolean;
};

export type TemplateBlockSpec = TemplateTextSpec | TemplateButtonSpec | TemplateShapeSpec;

export type TemplateGradient = { from: string; to: string; angle: number };

export type TemplatePageSpec = {
  size: ContentPageSizeId;
  bg?: string;
  gradient?: TemplateGradient;
  blocks: TemplateBlockSpec[];
};

export type TemplateDefinition = {
  id: string;
  name: string;
  category: TemplateCategoryId;
  subcategory: string;
  format: ContentPageSizeId;
  style: string;
  useCase: string;
  audience: string;
  tags: string[];
  /** Named palette from art.ts; defaults to 'mono' when omitted. */
  palette?: string;
  pages: TemplatePageSpec[];
};

/** Lowercase search blob is precomputed once per template for fast filtering. */
export function templateSearchBlob(template: TemplateDefinition): string {
  return [
    template.name,
    template.category,
    template.subcategory,
    template.style,
    template.useCase,
    template.audience,
    template.format,
    template.tags.join(' '),
  ].join(' ').toLowerCase();
}
