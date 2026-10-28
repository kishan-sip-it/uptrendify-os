'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronLeft, ChevronRight, Presentation, X } from 'lucide-react';
import { ContentDocumentView } from '@/components/content/content-document-view';
import { parseContentBody } from '@/lib/content/document';

/**
 * Read-only, one-page-at-a-time viewer for saved `uptrendify-doc` bodies.
 *
 * Each page is scaled to the available area at its real aspect ratio (the
 * renderer's fitToBounds mode) and the saved body is never mutated or
 * reflowed. Two viewing modes: Normal (embedded chrome with a pager) and a
 * dark distraction-free Presentation/Reading overlay — switchable at any
 * time. Keyboard: ←/→/PageUp/PageDown navigate, Home/End jump, Escape leaves
 * presentation (and closes a standalone overlay).
 */
export function ContentDocumentViewer({
  body,
  linkedValues,
  initialPage = 0,
  onClose,
}: {
  body: string;
  linkedValues?: { title?: string | null; cta?: string | null };
  initialPage?: number;
  /** Set for standalone overlay entries (editor Present): Escape/Exit closes. */
  onClose?: () => void;
}) {
  const doc = useMemo(() => parseContentBody(body), [body]);
  const pageCount = Math.max(1, doc?.pages.length ?? 1);
  const [pageIndex, setPageIndex] = useState(() => Math.max(0, Math.min(initialPage, pageCount - 1)));
  const [presentation, setPresentation] = useState(false);
  // Standalone entries start presented — after mount, so the portal never
  // renders during SSR.
  useEffect(() => {
    if (onClose) setPresentation(true);
  }, [onClose]);
  const page = Math.min(Math.max(0, pageIndex), pageCount - 1);

  useEffect(() => {
    if (!presentation) return;
    const onKey = (event: KeyboardEvent) => {
      const clamp = (value: number) => Math.max(0, Math.min(pageCount - 1, value));
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        setPageIndex((current) => clamp(Math.min(Math.max(0, current), pageCount - 1) + 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setPageIndex((current) => clamp(Math.min(Math.max(0, current), pageCount - 1) - 1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        setPageIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setPageIndex(pageCount - 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (onClose) onClose();
        else setPresentation(false);
      }
    };
    // Capture phase: a hosting overlay's own Escape handler (bubble phase)
    // must see the key already consumed while presenting.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [presentation, pageCount, onClose]);

  const stage = (
    <div className="content-doc-viewer-stage">
      {doc ? (
        <ContentDocumentView body={body} linkedValues={linkedValues} fitToBounds pageIndex={page} />
      ) : (
        <div className="content-doc-viewer-legacy">{body || 'No saved content body.'}</div>
      )}
    </div>
  );

  const controls = (
    <div className="content-doc-viewer-controls">
      {pageCount > 1 ? (
        <>
          <button type="button" className="content-doc-viewer-btn" onClick={() => setPageIndex(page - 1)} disabled={page === 0} aria-label="Previous page">
            <ChevronLeft size={14} /> Previous
          </button>
          <span className="content-doc-viewer-count" aria-live="polite">Page {page + 1} of {pageCount}</span>
          <button type="button" className="content-doc-viewer-btn" onClick={() => setPageIndex(page + 1)} disabled={page >= pageCount - 1} aria-label="Next page">
            Next <ChevronRight size={14} />
          </button>
        </>
      ) : (
        <span className="content-doc-viewer-count">1 page</span>
      )}
      <span className="content-doc-viewer-gap" aria-hidden="true" />
      {presentation ? (
        onClose ? (
          <button type="button" className="content-doc-viewer-btn" onClick={onClose}>
            <X size={14} /> Exit presentation
          </button>
        ) : (
          <button type="button" className="content-doc-viewer-btn" onClick={() => setPresentation(false)}>
            <BookOpen size={14} /> Normal view
          </button>
        )
      ) : (
        <button type="button" className="content-doc-viewer-btn" onClick={() => setPresentation(true)}>
          <Presentation size={14} /> Presentation
        </button>
      )}
    </div>
  );

  const viewer = (
    <div
      className="content-doc-viewer"
      role="region"
      aria-label="Content pages"
      onKeyDown={(event) => {
        if (presentation) return; // the window listener owns the keys while presenting
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          setPageIndex(Math.max(0, Math.min(pageCount - 1, page + (event.key === 'ArrowRight' ? 1 : -1))));
        }
      }}
    >
      {stage}
      {controls}
    </div>
  );

  if (!presentation) return viewer;

  return createPortal(
    <div className="content-doc-viewer-presentation" role="dialog" aria-modal="true" aria-label="Presentation view">
      <div className="content-doc-viewer-presentation-stage">{viewer}</div>
    </div>,
    document.body,
  );
}
