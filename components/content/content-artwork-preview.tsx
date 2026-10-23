'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye } from 'lucide-react';
import { AppDialog } from '@/components/ui/app-dialog';
import { ContentDocumentView } from '@/components/content/content-document-view';
import { CONTENT_PAGE_SIZES, parseContentBody } from '@/lib/content/document';

type LinkedValues = { title?: string | null; cta?: string | null };

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
  const fullDocumentRef = useRef<HTMLDivElement | null>(null);
  const doc = parseContentBody(body);
  const pageCount = Math.max(1, doc?.pages.length ?? 1);
  const currentPage = Math.min(activePage, pageCount - 1);

  useEffect(() => {
    if (!open || !doc) return;
    const container = fullDocumentRef.current;
    const page = container?.querySelector<HTMLElement>('[data-content-page-index="' + currentPage + '"]');
    if (!container || !page) return;
    const top = page.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top, behavior: 'smooth' });
  }, [open, currentPage, pageCount]);

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

      <AppDialog
        open={open}
        title={title}
        description={(versionLabel ? versionLabel + ' · ' : '') + pageCount + ' ' + (pageCount === 1 ? 'page' : 'pages') + '. Scroll through the complete saved artwork below.'}
        onClose={() => setOpen(false)}
        className="content-artwork-dialog"
      >
        {open ? (
          <>
            <div ref={fullDocumentRef} className="content-artwork-preview__full-document">
              {doc ? (
                <ContentDocumentView body={body} linkedValues={linkedValues} />
              ) : (
                <div className="content-artwork-preview__legacy-full">{body || 'No saved content body.'}</div>
              )}
            </div>
            {pageCount > 1 ? (
              <div className="content-artwork-preview__pager" aria-label="Page navigation">
                <button type="button" className="app-dialog__button" onClick={() => setActivePage((index) => Math.max(0, index - 1))} disabled={currentPage === 0}>
                  <ArrowLeft size={14} /> Previous
                </button>
                <span>Selected page {currentPage + 1} of {pageCount}</span>
                <button type="button" className="app-dialog__button" onClick={() => setActivePage((index) => Math.min(pageCount - 1, index + 1))} disabled={currentPage >= pageCount - 1}>
                  Next <ArrowRight size={14} />
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </AppDialog>
    </section>
  );
}
