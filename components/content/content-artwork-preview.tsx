'use client';

import { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { ContentDocumentView } from '@/components/content/content-document-view';
import { ContentDocumentViewer } from '@/components/content/content-document-viewer';
import { CONTENT_PAGE_SIZES, parseContentBody } from '@/lib/content/document';

type LinkedValues = { title?: string | null; cta?: string | null };

/**
 * Saved-artwork preview card: page thumbnails plus a one-page-at-a-time
 * dialog (Normal + Presentation modes). A plain fixed overlay rather than a
 * native <dialog>: the viewer's fullscreen presentation portal must be able
 * to paint above it, which top-layer dialog elements would forbid.
 */
export function ContentArtworkPreview({
  title,
  body,
  linkedValues,
  versionLabel,
}: {
  title: string;
  body: string;
  linkedValues?: LinkedValues;
  versionLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const doc = parseContentBody(body);
  const pageCount = Math.max(1, doc?.pages.length ?? 1);
  const currentPage = Math.min(activePage, pageCount - 1);

  // Escape closes the dialog — unless the viewer's presentation overlay
  // already consumed the key (it listens in the capture phase).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <section className="content-artwork-preview" aria-label="Saved content preview">
      {doc ? (
        <div className="content-artwork-preview__pages" aria-label={pageCount + ' saved pages'}>
          {doc.pages.map((page, index) => {
            const dimensions = CONTENT_PAGE_SIZES[page.size ?? 'a4'];
            return (
              <button
                type="button"
                key={page.id}
                className="content-artwork-preview__page"
                onClick={() => { setActivePage(index); setOpen(true); }}
                aria-label={'View page ' + (index + 1) + ' of ' + pageCount}
              >
                <span className="content-artwork-preview__page-label">Page {index + 1}</span>
                <span className="content-artwork-preview__thumbnail" style={{ aspectRatio: dimensions.width + ' / ' + dimensions.height }}>
                  <ContentDocumentView body={body} linkedValues={linkedValues} fitToBounds pageIndex={index} />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <button
          type="button"
          className="content-artwork-preview__legacy"
          onClick={() => { setActivePage(0); setOpen(true); }}
          aria-label="Open full text content"
        >
          {body.trim() || 'No saved content body.'}
        </button>
      )}
      <div className="content-artwork-preview__footer">
        <span>{pageCount} {pageCount === 1 ? 'page' : 'pages'}{versionLabel ? ' · ' + versionLabel : ''}</span>
        <button type="button" className="content-artwork-preview__open" onClick={() => { setActivePage(0); setOpen(true); }}>
          <Eye size={14} /> View full content
        </button>
      </div>

      {open ? (
        <div
          className="content-artwork-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <section className="app-dialog__panel content-artwork-overlay__panel">
            <header className="app-dialog__header">
              <div className="app-dialog__heading">
                <h2>{title}</h2>
                <p>{(versionLabel ? versionLabel + ' · ' : '') + pageCount + ' ' + (pageCount === 1 ? 'page' : 'pages') + '. One page at a time — flip pages, or switch to Presentation mode.'}</p>
              </div>
              <button type="button" className="app-dialog__close" onClick={() => setOpen(false)} aria-label="Close preview" autoFocus>
                <X size={17} />
              </button>
            </header>
            <div className="app-dialog__body">
              {doc ? (
                // key: a thumbnail click re-opens the dialog at that page.
                <ContentDocumentViewer key={'v' + currentPage} body={body} linkedValues={linkedValues} initialPage={currentPage} />
              ) : (
                <div className="content-artwork-preview__legacy-full">{body || 'No saved content body.'}</div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
