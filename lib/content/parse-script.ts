import {
  CONTENT_DOC_MAX_PAGES,
  CONTENT_DOC_MAX_TEXT,
  CONTENT_PAGE_SIZES,
  hashId,
  type ContentDocPage,
  type ContentPageSizeId,
} from '@/lib/content/document';

/** Build deterministic, editable storyboard pages from an existing video script. */
export function storyboardPagesFromScript(script: string, pageSize: ContentPageSizeId = 'story'): ContentDocPage[] {
  const normalized = script.replace(/\r\n?/g, '\n').trim();
  const paragraphs = normalized ? normalized.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean) : [''];
  const maxChunk = CONTENT_DOC_MAX_TEXT - 64;
  const scenes = paragraphs.flatMap((paragraph) => {
    if (paragraph.length <= maxChunk) return [paragraph];
    const chunks: string[] = [];
    for (let offset = 0; offset < paragraph.length; offset += maxChunk) chunks.push(paragraph.slice(offset, offset + maxChunk));
    return chunks;
  });
  const pageCount = Math.min(CONTENT_DOC_MAX_PAGES, scenes.length);
  let grouped: string[];
  if (scenes.length <= CONTENT_DOC_MAX_PAGES) {
    grouped = scenes;
  } else {
    const perPage = Math.ceil(scenes.length / CONTENT_DOC_MAX_PAGES);
    grouped = Array.from({ length: CONTENT_DOC_MAX_PAGES }, (_, index) => scenes.slice(index * perPage, (index + 1) * perPage).join('\n\n'));
  }
  const dims = CONTENT_PAGE_SIZES[pageSize];

  return grouped.slice(0, pageCount).map((scene, index) => {
    const sceneLines = scene.split('\n').map((line) => line.trim()).filter(Boolean);
    const hasSeparateHeading = sceneLines.length > 1 && sceneLines[0]!.length <= 120;
    const heading = hasSeparateHeading ? sceneLines[0]! : `Beat ${index + 1}`;
    const copy = hasSeparateHeading ? sceneLines.slice(1).join('\n').slice(0, maxChunk) : scene.slice(0, maxChunk);
    const pageId = `story-page-${hashId(`${index}|${scene}`)}`;
    const headingId = `story-heading-${hashId(`${pageId}|heading`)}`;
    const textId = `story-text-${hashId(`${pageId}|copy`)}`;
    return {
      id: pageId,
      size: pageSize,
      note: 'Imported from the existing video script. Edit the beat text directly on the canvas.',
      blocks: [
        { id: headingId, type: 'heading', text: heading, level: 2, align: 'left', color: null, bg: null, bold: true, italic: false, underline: false, geometry: { x: 40, y: 56, w: dims.width - 80, h: 110 } },
        // Content-sized box (same line estimate as layoutPageForFreeCanvas),
        // clamped to the page: an oversized hitbox blocks logo placement and
        // free-canvas selection across the rest of the page.
        { id: textId, type: 'text', text: copy, size: 'md', align: 'left', color: null, bg: null, bold: false, italic: false, underline: false, geometry: { x: 40, y: 190, w: dims.width - 80, h: storyboardTextHeight(copy, dims.width, dims.height) } },
      ],
    };
  });
}

/**
 * Height for a storyboard scene text box: the same width-per-character line
 * estimate the free-canvas flow conversion uses, grown 15% for estimate error
 * and clamped inside the page.
 */
function storyboardTextHeight(copy: string, pageWidth: number, pageHeight: number): number {
  const fontSize = 16;
  const maxWidth = pageWidth - 80;
  const charsPerLine = Math.max(12, Math.floor(maxWidth / Math.max(7, fontSize * 0.54)));
  const lines = copy.split(/\r?\n/).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  const estimated = Math.ceil(lines * fontSize * 1.45 * 1.15) + 12;
  return Math.max(120, Math.min(pageHeight - 240, estimated));
}

/** Approximate spoken duration at 150 words per minute. */
export function estimateSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / 2.5));
}
