import { CONTENT_PAGE_SIZES, hashId, type ContentDocPage, type ContentPageSizeId } from '@/lib/content/document';

/**
 * Original UpTrendifyOS Studio templates — free-canvas starter pages.
 * All geometry is in the page's own pixel space. Palette slots use the brand
 * accent; the user re-colours after inserting. No third-party assets.
 */

export type StudioTemplate = {
  id: string;
  label: string;
  size: ContentPageSizeId;
  build: (accent: string) => ContentDocPage;
};

const gid = (template: string, name: string) => `${template}-${name}-${hashId(`${template}|${name}`)}`;

function page(template: string, size: ContentPageSizeId, blocks: ContentDocPage['blocks'], note?: string): ContentDocPage {
  const dims = CONTENT_PAGE_SIZES[size];
  return {
    id: gid(template, `page-${size}`),
    size,
    note,
    blocks: blocks.map((block) => ({ ...block, geometry: { ...block.geometry, x: Math.round(block.geometry!.x * (dims.width / 760)), y: Math.round(block.geometry!.y * (dims.height / 1351)), w: Math.round(block.geometry!.w * (dims.width / 760)), h: Math.round(block.geometry!.h * (dims.height / 1351)) } })),
  };
}

const T = (id: string, extra: Partial<Extract<ContentDocPage['blocks'][number], { type: 'text' }>>) =>
  ({ id: gid(id, 't'), type: 'text', size: 'lg', bold: true, italic: false, underline: false, align: 'left', color: null, bg: null, ...extra } as ContentDocPage['blocks'][number]);

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: 'quote-card',
    label: 'Quote card',
    size: 'square',
    build: (accent) => page('quote-card', 'square', [
      { id: gid('quote', 'bar'), type: 'shape', shape: 'rectangle', color: accent, align: 'left', width: 30, height: 10, geometry: { x: 60, y: 90, w: 190, h: 14 } },
      { id: gid('quote', 'quote'), type: 'heading', text: '“Evidence beats opinion.”', level: 1, align: 'left', color: null, bg: null, bold: true, italic: false, underline: false, geometry: { x: 60, y: 140, w: 560, h: 220 } },
      { id: gid('quote', 'attr'), type: 'text', text: '— UpTrendifyOS Brand Brain', align: 'left', color: null, bg: null, size: 'md', bold: false, italic: true, underline: false, geometry: { x: 60, y: 400, w: 480, h: 60 } },
    ]),
  },
  {
    id: 'promo-story',
    label: 'Promo · Story',
    size: 'story',
    build: (accent) => page('promo-story', 'story', [
      { id: gid('promo', 'bg-shape'), type: 'shape', shape: 'circle', color: accent, align: 'center', width: 70, height: 300, geometry: { x: 110, y: 240, w: 540, h: 540 } },
      { id: gid('promo', 'head'), type: 'heading', text: 'Launch week is here', level: 1, align: 'center', color: null, bg: null, bold: true, italic: false, underline: false, geometry: { x: 60, y: 380, w: 640, h: 200 } },
      { id: gid('promo', 'sub'), type: 'text', text: 'Research the brand. Review the brain. Ship the strategy.', align: 'center', color: null, bg: null, size: 'lg', bold: false, italic: false, underline: false, geometry: { x: 80, y: 600, w: 600, h: 140 } },
      { id: gid('promo', 'cta'), type: 'button', text: 'Get started', href: null, color: accent, align: 'center', width: 60, geometry: { x: 230, y: 780, w: 300, h: 64 } },
    ], 'Story 9:16 promo — swap the circle for a product shot.'),
  },
  {
    id: 'announcement-a4',
    label: 'Announcement · A4',
    size: 'a4',
    build: (accent) => page('announcement-a4', 'a4', [
      { id: gid('ann', 'head'), type: 'heading', text: 'Big news from the team', level: 1, align: 'left', color: null, bg: null, bold: true, italic: false, underline: false, geometry: { x: 60, y: 70, w: 660, h: 120 } },
      { id: gid('ann', 'rule'), type: 'shape', shape: 'rectangle', color: accent, align: 'left', width: 100, height: 8, geometry: { x: 60, y: 210, w: 660, h: 8 } },
      { id: gid('ann', 'body'), type: 'text', text: 'Write the announcement here. Keep it to three short paragraphs: what changed, who it affects, what to do next.', align: 'left', color: null, bg: null, size: 'lg', bold: false, italic: false, underline: false, geometry: { x: 60, y: 250, w: 660, h: 320 } },
      { id: gid('ann', 'sign'), type: 'text', text: '— The team', align: 'left', color: null, bg: null, size: 'md', bold: false, italic: true, underline: false, geometry: { x: 60, y: 600, w: 300, h: 50 } },
    ]),
  },
  {
    id: 'product-square',
    label: 'Product feature',
    size: 'square',
    build: (accent) => page('product-square', 'square', [
      { id: gid('prod', 'img'), type: 'image', url: 'https://example.com/product.jpg', alt: 'Product screenshot', align: 'center', width: 80, geometry: { x: 80, y: 70, w: 600, h: 340 } },
      { id: gid('prod', 'head'), type: 'heading', text: 'One feature, zero busywork', level: 2, align: 'left', color: null, bg: null, bold: true, italic: false, underline: false, geometry: { x: 80, y: 450, w: 600, h: 90 } },
      { id: gid('prod', 'body'), type: 'text', text: 'Describe the outcome, not the feature. Two lines maximum.', align: 'left', color: null, bg: null, size: 'md', bold: false, italic: false, underline: false, geometry: { x: 80, y: 560, w: 600, h: 100 } },
      { id: gid('prod', 'cta'), type: 'button', text: 'Try it free', href: null, color: accent, align: 'left', width: 40, geometry: { x: 80, y: 690, w: 220, h: 56 } },
    ]),
  },
];

/** Build one template page, re-coloured to the brand accent. */
export function buildTemplatePage(templateId: string, accent: string): ContentDocPage | null {
  const template = STUDIO_TEMPLATES.find((entry) => entry.id === templateId);
  if (!template) return null;
  return template.build(accent || 'var(--st-accent)');
}

export function templateAccentSource(templateId: string): string | null {
  const template = STUDIO_TEMPLATES.find((entry) => entry.id === templateId);
  if (!template) return null;
  const shape = template.build('').blocks.find((block) => block.type === 'shape' || block.type === 'button');
  return shape && 'color' in shape ? shape.color ?? null : null;
}
