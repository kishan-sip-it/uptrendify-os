'use client';

import { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  CONTENT_PAGE_SIZES,
  DEFAULT_CONTENT_SHAPE_COLOR,
  DEFAULT_CONTENT_TEXT_COLOR,
  headingFontSizeForLevel,
  parseContentBody,
  resolveBlockText,
  type ContentDocBlock,
  type ContentDocPage,
  type InlineTextRun,
} from '@/lib/content/document';

/** A document is paper: white with fixed dark ink; a page may set its own background. */
const PAPER: React.CSSProperties = { background: '#ffffff', color: '#1d2634' };

/**
 * Load the exact private image saved with this content version. When an image
 * cannot be loaded, show an explicit error rather than rebuilding different pixels.
 */
function SavedArtworkImage({
  snapshot,
  alt,
}: {
  snapshot: NonNullable<ContentDocPage['snapshot']>;
  alt: string;
}) {
  const [state, setState] = useState<{ src: string | null; status: 'loading' | 'error'; message?: string }>({ src: null, status: 'loading' });

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setState({ src: null, status: 'loading' });

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.storage.from('brand-assets').download(snapshot.path);
        if (error || !data) throw error ?? new Error('Saved artwork was not found');
        const bytes = await data.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const actualHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        if (actualHash.toLowerCase() !== snapshot.sha256.toLowerCase()) {
          throw new Error('Saved artwork integrity check failed');
        }
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: snapshot.mimeType }));
        if (active) setState({ src: objectUrl, status: 'loading' });
        else URL.revokeObjectURL(objectUrl);
      } catch (error) {
        const message = error instanceof Error && /integrity check failed/i.test(error.message)
          ? 'Saved artwork failed its SHA-256 integrity check. Do not approve or publish this version; ask an editor to save a new version.'
          : 'Saved artwork could not be downloaded or verified. The editable source was not substituted. Check access to the private artwork file; ask an editor to save a new version if the problem persists.';
        if (active) setState({ src: null, status: 'error', message });
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [snapshot.path]);

  if (!state.src) {
    return (
      <div
        role={state.status === 'error' ? 'alert' : 'status'}
        aria-label={state.status === 'error' ? 'Saved artwork unavailable' : 'Loading saved artwork'}
        style={{
          display: 'grid',
          placeItems: 'center',
          width: '100%',
          height: '100%',
          minHeight: 120,
          padding: 16,
          background: '#f1f5f9',
          color: '#475569',
          fontSize: 12,
          textAlign: 'center',
        }}
      >
        {state.status === 'error' ? (state.message ?? 'Saved artwork could not be loaded or verified. The editable source has not been substituted.') : 'Loading saved artwork…'}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="content-doc-saved-artwork-image"
      src={state.src}
      alt={alt}
      draggable={false}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'fill', margin: 0, padding: 0, border: 0, borderRadius: 0 }}
    />
  );
}

function renderInlineText(value: string, runs?: InlineTextRun[]) {
  const useRuns = Boolean(runs?.length && runs.map((run) => run.text).join('') === value);
  const displayRuns = useRuns ? runs! : [{ text: value }];
  return displayRuns.map((run, index) => (
    <span
      key={index}
      style={{
        ...(run.bold !== undefined ? { fontWeight: run.bold ? 700 : 400 } : {}),
        ...(run.italic !== undefined ? { fontStyle: run.italic ? 'italic' : 'normal' } : {}),
        ...(run.underline !== undefined ? { textDecoration: run.underline ? 'underline' : 'none' } : {}),
        ...(run.color !== undefined ? { color: run.color ?? 'inherit' } : {}),
        ...(run.bg !== undefined ? { backgroundColor: run.bg ?? 'transparent' } : {}),
        ...(run.fontSize !== undefined ? { fontSize: `${run.fontSize}px` } : {}),
        ...(run.fontFamily ? { fontFamily: run.fontFamily } : {}),
        whiteSpace: 'pre-wrap',
      }}
    >
      {run.text}
    </span>
  ));
}

/**
 * The single structured-document renderer for saved content bodies.
 *
 * Used by the content detail version card, the editor canvas, the approval
 * queue review card and the publishing preview, so every stage of the
 * workflow renders the exact saved `uptrendify-doc` body — pages, headings,
 * text with emphasis, images, shapes and CTA blocks. Legacy plain-text bodies
 * render unchanged.
 */
export function ContentDocumentView({
  body,
  linkedValues,
  fitToBounds = false,
  pageIndex,
}: {
  body: string;
  linkedValues?: { title?: string | null; cta?: string | null };
  fitToBounds?: boolean;
  pageIndex?: number;
}) {
  const fitViewportRef = useRef<HTMLDivElement | null>(null);
  const [fitViewport, setFitViewport] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!fitToBounds) return;
    const element = fitViewportRef.current;
    if (!element) return;
    const update = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setFitViewport((previous) => previous.width === next.width && previous.height === next.height ? previous : next);
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [fitToBounds]);

  const doc = parseContentBody(body);
  if (!doc) return <>{body}</>;
  const free = doc.mode === 'free';
  const currentPageIndex = pageIndex === undefined ? 0 : Math.max(0, Math.min(pageIndex, doc.pages.length - 1));
  const selectedPage = doc.pages[currentPageIndex];
  const freeDims = CONTENT_PAGE_SIZES[selectedPage?.size ?? doc.pages[0]?.size ?? 'a4'];
  const visiblePages = pageIndex === undefined
    ? doc.pages.map((page, originalIndex) => ({ page, originalIndex }))
    : [{ page: selectedPage!, originalIndex: currentPageIndex }];
  const scale = fitToBounds && free
    ? (fitViewport.width > 0 && fitViewport.height > 0
      ? Math.min(1, fitViewport.width / freeDims.width, fitViewport.height / freeDims.height)
      : Math.min(1, 520 / freeDims.width, 500 / freeDims.height))
    : 1;

  const documentElement = (
    <div className={`content-doc${free ? ' is-free' : ''}`} style={{ ...PAPER, ...(free ? { width: freeDims.width, height: freeDims.height } : {}) }}>
      {visiblePages.map(({ page, originalIndex: pageIndex }) => (
        <div
          key={page.id}
          className={`content-doc-page${doc.mode === 'free' ? ' is-free' : ''}`}
          style={{
            ...(page.bg ? { background: page.bg, borderRadius: 10 } : {}),
            ...(page.backgroundImage ? {
              backgroundImage: `url(${JSON.stringify(page.backgroundImage.src)})`,
              backgroundSize: page.backgroundImage.fit ?? 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            } : {}),
            ...(doc.mode === 'free' ? {
              position: 'relative',
              width: CONTENT_PAGE_SIZES[page.size ?? 'a4'].width,
              height: CONTENT_PAGE_SIZES[page.size ?? 'a4'].height,
              backgroundColor: page.bg ?? '#ffffff',
              overflow: 'hidden',
            } : {}),
          }}
        >
          {page.snapshot ? (
            <SavedArtworkImage snapshot={page.snapshot} alt={`Saved artwork, page ${pageIndex + 1}`} />
          ) : (
            <>
              {pageIndex > 0 ? <div className="content-doc-page-break">Page {pageIndex + 1}</div> : null}
              {page.blocks.length === 0 && doc.mode !== 'free' ? <p className="content-doc-page-empty">Empty page</p> : null}
              {page.blocks.filter((block) => !block.hidden).map((block) => {
            const geoStyle = {
              ...(doc.mode === 'free' && block.geometry ? {
                position: 'absolute' as const,
                left: block.geometry.x,
                top: block.geometry.y,
                width: block.geometry.w,
                height: block.geometry.h,
                transform: block.geometry.rotation ? `rotate(${block.geometry.rotation}deg)` : undefined,
              } : {}),
              opacity: block.opacity ?? 1,
            };
            if (block.type === 'heading') {
              const Tag = (block.level === 1 ? 'h1' : block.level === 3 ? 'h3' : 'h2') as 'h1' | 'h2' | 'h3';
              return (
                <Tag
                  key={block.id}
                  className={`content-doc-heading align-${block.align}`}
                  style={{
                    ...geoStyle,
                    color: block.color ?? DEFAULT_CONTENT_TEXT_COLOR,
                    ...(block.bg ? { background: block.bg } : {}),
                    fontSize: `${block.fontSize ?? headingFontSizeForLevel(block.level)}px`, fontFamily: block.fontFamily || undefined, fontWeight: block.bold ? 800 : undefined,
                    fontStyle: block.italic ? 'italic' : undefined,
                    textDecoration: block.underline ? 'underline' : undefined,
                  }}
                >
                  {block.href ? <a href={block.href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'inherit' }}>{renderInlineText(resolveBlockText(block, linkedValues), block.richText)}</a> : renderInlineText(resolveBlockText(block, linkedValues), block.richText)}
                </Tag>
              );
            }
            if (block.type === 'text') {
              return (
                <p
                  key={block.id}
                  className={`content-doc-text size-${block.size} align-${block.align}`}
                  style={{
                    ...geoStyle,
                    color: block.color ?? DEFAULT_CONTENT_TEXT_COLOR,
                    ...(block.bg ? { background: block.bg } : {}),
                    fontSize: block.fontSize ? `${block.fontSize}px` : undefined, fontFamily: block.fontFamily || undefined, fontWeight: block.bold ? 700 : undefined,
                    fontStyle: block.italic ? 'italic' : undefined,
                    textDecoration: block.underline ? 'underline' : undefined,
                  }}
                >
                  {block.href ? <a href={block.href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'inherit' }}>{renderInlineText(resolveBlockText(block, linkedValues), block.richText)}</a> : renderInlineText(resolveBlockText(block, linkedValues), block.richText)}
                </p>
              );
            }
            if (block.type === 'image') {
              return (
                <div key={block.id} className={`content-doc-image align-${block.align}`} style={geoStyle}>
                  {/* Preview only; the URL is validated to http(s) by the body schema. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={block.url} alt={block.alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {block.alt ? <span className="content-doc-image-alt">{block.alt}</span> : null}
                </div>
              );
            }
            if (block.type === 'shape') {
              return (
                <div key={block.id} className={`content-doc-shape align-${block.align}`} style={geoStyle}>
                  {block.svgPath && block.svgBounds && block.svgMatrix ? (
                    <svg
                      width="100%"
                      height="100%"
                      viewBox={"0 0 " + block.svgBounds.w + " " + block.svgBounds.h}
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        d={block.svgPath}
                        transform={"translate(" + (-block.svgBounds.x) + " " + (-block.svgBounds.y) + ") matrix(" + block.svgMatrix.a + " " + block.svgMatrix.b + " " + block.svgMatrix.c + " " + block.svgMatrix.d + " " + block.svgMatrix.e + " " + block.svgMatrix.f + ")"}
                        fill={block.svgFillNone ? 'none' : (block.color ?? DEFAULT_CONTENT_SHAPE_COLOR)}
                        stroke={block.svgFillNone ? (block.color ?? block.svgStroke ?? 'none') : (block.svgStroke ?? 'none')}
                        strokeWidth={block.svgStrokeWidth ?? 1}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <span
                      className={`content-doc-shape-item is-${block.shape}`}
                      style={{ background: block.color ?? DEFAULT_CONTENT_SHAPE_COLOR, width: '100%', height: '100%' }}
                    />
                  )}
                </div>
              );
            }
            return (
              <div key={block.id} className={`content-doc-cta align-${block.align}`} style={geoStyle}>
                <span className={`content-doc-cta-button${block.color ? ' is-custom' : ''}`} style={{ ...(block.color ? { background: block.color, borderColor: 'transparent' } : {}), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                  {resolveBlockText(block, linkedValues)}
                </span>
              </div>
            );
              })}
            </>
          )}
        </div>
      ))}
    </div>
  );

  if (fitToBounds && free) {
    const scaledWidth = freeDims.width * scale;
    const scaledHeight = freeDims.height * scale;
    return (
      <div ref={fitViewportRef} className="content-doc-fit-viewport" style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
        <div style={{ position: 'relative', width: scaledWidth, height: scaledHeight, maxWidth: '100%', flex: '0 0 auto' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: freeDims.width, height: freeDims.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {documentElement}
          </div>
        </div>
      </div>
    );
  }
  return documentElement;
}
