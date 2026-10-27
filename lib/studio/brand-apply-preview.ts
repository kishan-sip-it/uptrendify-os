import { serializeContentDocument, type ContentDocPage } from '@/lib/content/document';
import { applyBrandEssentials, type ApplyScope, type BrandEssentials } from './apply-brand-essentials';

/**
 * Before/After preview for the Apply Brand Essentials dialog.
 *
 * Pure: builds both preview bodies from the live pages WITHOUT touching the
 * editor state — no upload, no commit, no version. The After side carries the
 * exact transformation the real apply would perform, and invalidates the saved
 * raster snapshot on precisely the pages whose design changes (the same
 * contract as the editor's `commit`), so ContentDocumentView renders the
 * transformed structured blocks instead of the stale bitmap. The Before side
 * is byte-identical to the live document.
 */

export type BrandApplyPreviewInput = {
  pages: ContentDocPage[];
  essentials: BrandEssentials;
  scope: ApplyScope;
  activePageIndex: number;
  includeLogo: boolean;
  /** Managed asset src when already imported; the scanned URL is preview-only. */
  logoSrc?: string | null;
  logoAspect?: number;
  logoFailure?: { reason: string } | null;
};

export type BrandApplyPreview = {
  pageIndex: number;
  before: string;
  after: string;
  /** Honest one-line state of the proposed logo, or null when nothing to say. */
  note: string | null;
};

function isManagedStudioSrc(src: string | null | undefined): boolean {
  return typeof src === 'string' && src.startsWith('/api/brands/');
}

export function buildBrandApplyPreview(input: BrandApplyPreviewInput): BrandApplyPreview {
  const source = { kind: 'uptrendify-doc' as const, version: 1 as const, mode: 'free' as const, pages: input.pages };
  const before = serializeContentDocument(source);
  const result = applyBrandEssentials({
    doc: source,
    essentials: input.essentials,
    scope: input.scope,
    activePageIndex: input.activePageIndex,
    logoSrc: input.logoSrc ?? null,
    logoAspect: input.logoAspect,
    includeLogo: input.includeLogo,
    logoFailure: input.logoFailure ?? null,
  });
  // Snapshot invalidation follows the commit contract: only pages whose design
  // actually changed lose their saved raster; untouched pages keep theirs.
  const changed = new Set(result.changedPageIds);
  const afterPages = result.doc.pages.map((page) => (changed.has(page.id) ? { ...page, snapshot: undefined } : page));
  const after = serializeContentDocument({ ...result.doc, pages: afterPages });

  const pageLogoEntry = result.stats.logo.find((entry) => entry.pageIndex === input.activePageIndex);
  let logoNote: string | null = null;
  if (!input.includeLogo) {
    logoNote = null;
  } else if (input.logoFailure) {
    logoNote = `Logo will not be placed: ${input.logoFailure.reason}`;
  } else if (!input.essentials.logoUrl) {
    logoNote = 'No logo was scanned, so none can be placed.';
  } else if (pageLogoEntry?.outcome === 'no-space') {
    logoNote = 'No free space fit the logo on this page — apply anyway and place it by hand, or remove an element.';
  } else if (pageLogoEntry?.outcome === 'limit') {
    logoNote = 'This page hit its element limit, so the logo was not planned here.';
  } else if (isManagedStudioSrc(input.logoSrc)) {
    logoNote = null;
  } else if (input.logoSrc) {
    logoNote = 'Preview shows the scanned logo file; Apply imports a managed copy first.';
  } else {
    logoNote = 'Logo will not be placed: the brand logo asset was not imported.';
  }

  // Background provenance is always disclosed: scanned value vs palette wash.
  let backgroundNote: string | null = null;
  if (result.stats.backgroundTreatment === 'scanned-surface') {
    backgroundNote = `Background: the scanned site surface ${result.stats.backgroundColour}.`;
  } else if (result.stats.backgroundTreatment === 'derived-wash') {
    backgroundNote = `Background: a tint derived from your brand palette (${result.stats.backgroundColour}) — the scan captured no explicit site background.`;
  } else if (result.stats.backgroundTreatment === 'preserved-media') {
    backgroundNote = 'Background kept: your background image or gradient stays as it is.';
  }
  const note = [backgroundNote, logoNote].filter(Boolean).join(' ') || null;
  return { pageIndex: input.activePageIndex, before, after, note };
}
