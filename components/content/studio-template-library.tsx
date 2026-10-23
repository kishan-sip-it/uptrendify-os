'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, LayoutGrid, RotateCcw, Search, X } from 'lucide-react';
import { AppDialog } from '@/components/ui/app-dialog';
import { ContentDocumentView } from '@/components/content/content-document-view';
import { CONTENT_PAGE_SIZES, serializeContentDocument, type ContentPageSizeId } from '@/lib/content/document';
import { buildTemplateDocument } from '@/lib/studio/template-library/build';
import { templatePaletteByName } from '@/lib/studio/template-library/art';
import { STUDIO_LIBRARY } from '@/lib/studio/template-library';
import { TEMPLATE_CATEGORIES, templateSearchBlob, type TemplateCategoryId, type TemplateDefinition } from '@/lib/studio/template-library/types';

/**
 * Template library holder for the Studio inspector. Browses the bundled
 * 500-template catalogue with search, filters, lazy schema-accurate
 * thumbnails (rendered by the canonical ContentDocumentView) and a full
 * preview before applying. Application itself stays in the workspace so the
 * confirm/versioning semantics cannot be bypassed.
 */

const CATEGORY_LABEL: Record<TemplateCategoryId, string> = Object.fromEntries(
  TEMPLATE_CATEGORIES.map((category) => [category.id, category.label]),
) as Record<TemplateCategoryId, string>;

const THUMB_BODY_CACHE = new Map<string, string>();

function templateBody(definition: TemplateDefinition, accent: string): string {
  const key = `${definition.id}|${accent}`;
  const cached = THUMB_BODY_CACHE.get(key);
  if (cached) return cached;
  const body = serializeContentDocument(buildTemplateDocument(definition, templatePaletteByName(paletteNameOf(definition)), accent || null));
  if (THUMB_BODY_CACHE.size > 1200) THUMB_BODY_CACHE.clear();
  THUMB_BODY_CACHE.set(key, body);
  return body;
}

/** Palette is stored on each definition at catalogue build time. */
function paletteNameOf(definition: TemplateDefinition): string {
  return definition.palette ?? 'mono';
}

function useNearView(active: boolean): { ref: (node: HTMLElement | null) => void; visible: boolean } {
  const [visible, setVisible] = useState(!active);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const setNode = (node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    if (!node || !active || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observerRef.current?.disconnect();
      }
    }, { rootMargin: '320px' });
    observerRef.current.observe(node);
  };
  useEffect(() => () => observerRef.current?.disconnect(), []);
  return { ref: setNode, visible };
}

function TemplateThumb({ definition, accent, eager }: { definition: TemplateDefinition; accent: string; eager: boolean }) {
  const { ref, visible } = useNearView(!eager);
  const dims = CONTENT_PAGE_SIZES[definition.format];
  const [firstPage] = definition.pages;
  const size = firstPage?.size ?? definition.format;
  const pageDims = CONTENT_PAGE_SIZES[size];
  return (
    <div
      ref={ref}
      className="st-tpl-thumb"
      style={{ aspectRatio: `${dims.width} / ${dims.height}`, maxHeight: 170, margin: '0 auto' }}
      aria-hidden="true"
    >
      {visible ? (
        <ContentDocumentView body={templateBody(definition, accent)} fitToBounds pageIndex={0} />
      ) : (
        <div className="st-tpl-thumb-skeleton" style={{ aspectRatio: `${pageDims.width} / ${pageDims.height}` }} />
      )}
    </div>
  );
}

export function StudioTemplateLibrary({ accent, canEdit, currentPageNumber, pageCount, maxPages, onApplyToPage, onApplyAsPages }: {
  accent: string;
  canEdit: boolean;
  currentPageNumber: number;
  pageCount: number;
  maxPages: number;
  /** Replace the current page with page 1 of the template (workspace confirms first). */
  onApplyToPage: (templateId: string) => void;
  /** Insert every template page after the current page (workspace confirms first). */
  onApplyAsPages: (templateId: string) => void;
}) {
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | TemplateCategoryId>('all');
  const [format, setFormat] = useState<'all' | ContentPageSizeId>('all');
  const [style, setStyle] = useState('all');
  const [sort, setSort] = useState<'curated' | 'title-asc' | 'title-desc'>('curated');
  const [visibleCount, setVisibleCount] = useState(24);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);

  const styles = useMemo(() => Array.from(new Set(STUDIO_LIBRARY.map((template) => template.style))).sort(), []);

  const searchBlobs = useMemo(() => {
    const blobs = new Map<string, string>();
    for (const template of STUDIO_LIBRARY) blobs.set(template.id, templateSearchBlob(template));
    return blobs;
  }, []);

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = STUDIO_LIBRARY.filter((template) => {
      if (category !== 'all' && template.category !== category) return false;
      if (format !== 'all' && template.format !== format) return false;
      if (style !== 'all' && template.style !== style) return false;
      if (!words.length) return true;
      const blob = searchBlobs.get(template.id) ?? '';
      return words.every((word) => blob.includes(word));
    });
    if (sort === 'title-asc') return [...matches].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'title-desc') return [...matches].sort((a, b) => b.name.localeCompare(a.name));
    return matches;
  }, [query, category, format, style, sort, searchBlobs]);

  useEffect(() => { setVisibleCount(24); }, [query, category, format, style, sort]);

  const filtersActive = query !== '' || category !== 'all' || format !== 'all' || style !== 'all';
  const resetFilters = () => {
    setDraftQuery('');
    setQuery('');
    setCategory('all');
    setFormat('all');
    setStyle('all');
  };

  const preview = previewId ? STUDIO_LIBRARY.find((template) => template.id === previewId) ?? null : null;
  useEffect(() => { setPreviewPageIndex(0); }, [previewId]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="st-tpl-library">
      <form
        className="st-tpl-search"
        role="search"
        aria-label="Search templates"
        onSubmit={(event) => { event.preventDefault(); setQuery(draftQuery.trim()); }}
      >
        <label className="st-field">
          <span>Search 500 templates</span>
          <input
            className="st-input"
            type="search"
            value={draftQuery}
            placeholder="Quote, product launch, pitch, tutor…"
            disabled={!canEdit}
            onChange={(event) => { setDraftQuery(event.target.value); setQuery(event.target.value.trim()); }}
            aria-label="Search templates by name, use case, audience or tag"
          />
        </label>
        <div className="st-field-row">
          <button type="submit" className="st-btn st-btn--primary" disabled={!canEdit}><Search size={13} /> Search</button>
          <button type="button" className="st-btn" disabled={!canEdit || draftQuery === ''} onClick={() => { setDraftQuery(''); setQuery(''); }}><X size={13} /> Clear</button>
        </div>
      </form>

      <label className="st-field">
        <span>Category</span>
        <select className="st-select" value={category} disabled={!canEdit} onChange={(event) => setCategory(event.target.value as 'all' | TemplateCategoryId)}>
          <option value="all">All categories</option>
          {TEMPLATE_CATEGORIES.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.label} ({STUDIO_LIBRARY.filter((template) => template.category === entry.id).length})</option>
          ))}
        </select>
      </label>

      <div className="st-field-row">
        <label className="st-field">
          <span>Format</span>
          <select className="st-select" value={format} disabled={!canEdit} onChange={(event) => setFormat(event.target.value as 'all' | ContentPageSizeId)}>
            <option value="all">All formats</option>
            {CONTENT_PAGE_SIZE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="st-field">
          <span>Style</span>
          <select className="st-select" value={style} disabled={!canEdit} onChange={(event) => setStyle(event.target.value)}>
            <option value="all">All styles</option>
            {styles.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </label>
      </div>

      <div className="st-field-row">
        <label className="st-field">
          <span>Sort</span>
          <select className="st-select" value={sort} disabled={!canEdit} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="curated">Curated order</option>
            <option value="title-asc">Title A–Z</option>
            <option value="title-desc">Title Z–A</option>
          </select>
        </label>
        <button type="button" className="st-btn" style={{ height: 32, alignSelf: 'end' }} disabled={!canEdit || !filtersActive} onClick={resetFilters}><RotateCcw size={13} /> Reset filters</button>
      </div>

      <p className="st-tpl-count" role="status">
        {filtered.length === STUDIO_LIBRARY.length
          ? `Showing all ${STUDIO_LIBRARY.length} templates`
          : `${filtered.length} of ${STUDIO_LIBRARY.length} templates match`}
      </p>

      {filtered.length === 0 ? (
        <div className="st-tpl-empty">
          <LayoutGrid size={18} aria-hidden="true" />
          <p>No templates match. Try fewer words, or reset the filters.</p>
          <button type="button" className="st-btn" onClick={resetFilters}><RotateCcw size={13} /> Reset filters</button>
        </div>
      ) : (
        <>
          <ul className="st-tpl-grid" aria-label="Template results">
            {visible.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="st-tpl-card"
                  disabled={!canEdit}
                  onClick={() => setPreviewId(template.id)}
                  aria-label={`Preview ${template.name}: ${CATEGORY_LABEL[template.category]}, ${CONTENT_PAGE_SIZES[template.format].label}, ${template.style} style. ${template.useCase}`}
                >
                  <TemplateThumb definition={template} accent={accent} eager={false} />
                  <span className="st-tpl-card-name">{template.name}</span>
                  <span className="st-tpl-card-meta">
                    <span className="st-preview-tag">{template.subcategory}</span>
                    <span className="st-preview-tag">{CONTENT_PAGE_SIZES[template.format].label.split('·')[0]?.trim()}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {visibleCount < filtered.length ? (
            <button type="button" className="st-btn st-tpl-more" disabled={!canEdit} onClick={() => setVisibleCount((count) => count + 48)}>
              Show more ({filtered.length - visibleCount} left)
            </button>
          ) : null}
        </>
      )}

      <AppDialog
        open={Boolean(preview)}
        title={preview?.name ?? 'Template preview'}
        description={preview ? `${CATEGORY_LABEL[preview.category]} · ${preview.subcategory} · ${CONTENT_PAGE_SIZES[preview.format].label}` : undefined}
        onClose={() => setPreviewId(null)}
        className="studio-template-preview-dialog"
      >
        {preview ? (
          <div className="st-tpl-preview">
            <div className="st-tpl-preview-stage">
              <div className="st-tpl-thumb st-tpl-preview-frame" style={{ aspectRatio: `${CONTENT_PAGE_SIZES[preview.pages[previewPageIndex]?.size ?? preview.format].width} / ${CONTENT_PAGE_SIZES[preview.pages[previewPageIndex]?.size ?? preview.format].height}` }}>
                <ContentDocumentView body={templateBody(preview, accent)} fitToBounds pageIndex={previewPageIndex} />
              </div>
            </div>
            {preview.pages.length > 1 ? (
              <div className="st-tpl-preview-pages" role="tablist" aria-label="Template pages">
                {preview.pages.map((page, index) => (
                  <button
                    key={`${preview.id}-page-${index}`}
                    type="button"
                    role="tab"
                    aria-selected={previewPageIndex === index}
                    className={`st-tpl-page-dot${previewPageIndex === index ? ' is-active' : ''}`}
                    onClick={() => setPreviewPageIndex(index)}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            ) : null}
            <dl className="st-tpl-preview-meta">
              <div><dt>Use case</dt><dd>{preview.useCase}</dd></div>
              <div><dt>Audience</dt><dd>{preview.audience}</dd></div>
              <div><dt>Style</dt><dd>{preview.style}</dd></div>
              <div><dt>Pages</dt><dd>{preview.pages.length}</dd></div>
              <div><dt>Tags</dt><dd>{preview.tags.join(', ')}</dd></div>
            </dl>
            <div className="st-tpl-preview-actions">
              <button
                type="button"
                className="st-btn st-btn--primary"
                disabled={!canEdit}
                onClick={() => { onApplyToPage(preview.id); setPreviewId(null); }}
              >
                <Check size={13} /> Replace page {currentPageNumber}
              </button>
              {preview.pages.length > 1 ? (
                <button
                  type="button"
                  className="st-btn"
                  disabled={!canEdit || pageCount + preview.pages.length - 1 > maxPages}
                  title={pageCount + preview.pages.length - 1 > maxPages ? `Documents hold at most ${maxPages} pages` : undefined}
                  onClick={() => { onApplyAsPages(preview.id); setPreviewId(null); }}
                >
                  Add all {preview.pages.length} pages
                </button>
              ) : null}
              <button type="button" className="st-btn" onClick={() => setPreviewId(null)}>Close</button>
            </div>
          </div>
        ) : null}
      </AppDialog>
    </div>
  );
}

const CONTENT_PAGE_SIZE_OPTIONS: Array<{ value: ContentPageSizeId; label: string }> = [
  { value: 'square', label: 'Square 1:1' },
  { value: 'portrait', label: 'Portrait 4:5' },
  { value: 'story', label: 'Story 9:16' },
  { value: 'landscapeSocial', label: 'Landscape 1.91:1' },
  { value: 'wide', label: 'Wide 16:9' },
  { value: 'a4', label: 'A4 portrait' },
  { value: 'landscape', label: 'A4 landscape' },
  { value: 'letter', label: 'US Letter' },
];
