'use client';

import { CONTENT_PAGE_SIZES, parseContentBody, resolveBlockText, type ContentDocument, type ContentDocBlock } from '@/lib/content/document';

/** A document is paper: white with fixed dark ink; a page may set its own background. */
const PAPER: React.CSSProperties = { background: '#ffffff', color: '#1d2634' };

/**
 * The single structured-document renderer for saved content bodies.
 *
 * Used by the content detail version card, the editor canvas, the approval
 * queue review card and the publishing preview, so every stage of the
 * workflow renders the exact saved `uptrendify-doc` body — pages, headings,
 * text with emphasis, images, shapes and CTA blocks. Legacy plain-text bodies
 * render unchanged.
 */
export function ContentDocumentView({ body, linkedValues }: { body: string; linkedValues?: { title?: string | null; cta?: string | null } }) {
  const doc = parseContentBody(body);
  if (!doc) return <>{body}</>;
  const free = doc.mode === 'free';
  const freeDims = CONTENT_PAGE_SIZES[doc.pages[0]?.size ?? 'a4'];
  return (
    <div className={`content-doc${free ? ' is-free' : ''}`} style={{ ...PAPER, ...(free ? { width: freeDims.width, height: freeDims.height } : {}) }}>
      {doc.pages.map((page, pageIndex) => (
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
                    ...(block.color ? { color: block.color } : {}),
                    ...(block.bg ? { background: block.bg } : {}),
                    fontSize: block.fontSize ? `${block.fontSize}px` : undefined, fontFamily: block.fontFamily || undefined, fontWeight: block.bold ? 800 : undefined,
                    fontStyle: block.italic ? 'italic' : undefined,
                    textDecoration: block.underline ? 'underline' : undefined,
                  }}
                >
                  {resolveBlockText(block, linkedValues)}
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
                    ...(block.color ? { color: block.color } : {}),
                    ...(block.bg ? { background: block.bg, ...(block.bgMatch ? { padding: 0, borderRadius: 0 } : {}) } : {}),
                    fontSize: block.fontSize ? `${block.fontSize}px` : undefined, fontFamily: block.fontFamily || undefined, fontWeight: block.bold ? 700 : undefined,
                    fontStyle: block.italic ? 'italic' : undefined,
                    textDecoration: block.underline ? 'underline' : undefined,
                  }}
                >
                  {resolveBlockText(block, linkedValues)}
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
                        fill={block.svgFillNone ? 'none' : (block.color ?? 'var(--accent)')}
                        stroke={block.svgFillNone ? (block.color ?? block.svgStroke ?? 'none') : (block.svgStroke ?? 'none')}
                        strokeWidth={block.svgStrokeWidth ?? 1}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <span
                      className={`content-doc-shape-item is-${block.shape}`}
                      style={{ background: block.color ?? 'var(--accent)', width: '100%', height: '100%' }}
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
        </div>
      ))}
    </div>
  );
}
