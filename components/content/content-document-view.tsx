'use client';

import { parseContentBody } from '@/lib/content/document';

/**
 * The single structured-document renderer for saved content bodies.
 *
 * Used by the content detail version card, the editor canvas, the approval
 * queue review card and the publishing preview, so every stage of the
 * workflow renders the exact saved `uptrendify-doc` body — pages, headings,
 * text with emphasis, images, shapes and CTA blocks. Legacy plain-text bodies
 * render unchanged.
 */
export function ContentDocumentView({ body }: { body: string }) {
  const doc = parseContentBody(body);
  if (!doc) return <>{body}</>;
  return (
    <div className="content-doc">
      {doc.pages.map((page, pageIndex) => (
        <div key={page.id} className="content-doc-page">
          {pageIndex > 0 ? <div className="content-doc-page-break">Page {pageIndex + 1}</div> : null}
          {page.blocks.length === 0 ? <p className="content-doc-page-empty">Empty page</p> : null}
          {page.blocks.map((block) => {
            if (block.type === 'heading') {
              const Tag = (block.level === 1 ? 'h1' : block.level === 3 ? 'h3' : 'h2') as 'h1' | 'h2' | 'h3';
              return (
                <Tag
                  key={block.id}
                  className={`content-doc-heading align-${block.align}`}
                  style={{
                    ...(block.color ? { color: block.color } : {}),
                    ...(block.bg ? { background: block.bg } : {}),
                    fontWeight: block.bold ? 800 : undefined,
                    fontStyle: block.italic ? 'italic' : undefined,
                    textDecoration: block.underline ? 'underline' : undefined,
                  }}
                >
                  {block.text}
                </Tag>
              );
            }
            if (block.type === 'text') {
              return (
                <p
                  key={block.id}
                  className={`content-doc-text size-${block.size} align-${block.align}`}
                  style={{
                    ...(block.color ? { color: block.color } : {}),
                    ...(block.bg ? { background: block.bg } : {}),
                    fontWeight: block.bold ? 700 : undefined,
                    fontStyle: block.italic ? 'italic' : undefined,
                    textDecoration: block.underline ? 'underline' : undefined,
                  }}
                >
                  {block.text}
                </p>
              );
            }
            if (block.type === 'image') {
              return (
                <div key={block.id} className={`content-doc-image align-${block.align}`}>
                  {/* Preview only; the URL is validated to http(s) by the body schema. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={block.url} alt={block.alt} style={{ width: `${block.width ?? 80}%` }} />
                  {block.alt ? <span className="content-doc-image-alt">{block.alt}</span> : null}
                </div>
              );
            }
            if (block.type === 'shape') {
              return (
                <div key={block.id} className={`content-doc-shape align-${block.align}`}>
                  <span
                    className={`content-doc-shape-item is-${block.shape}`}
                    style={{ background: block.color ?? 'var(--accent)', width: `${block.width ?? 60}%`, height: block.height }}
                  />
                </div>
              );
            }
            return (
              <div key={block.id} className={`content-doc-cta align-${block.align}`}>
                <span className={`content-doc-cta-button${block.color ? ' is-custom' : ''}`} style={block.color ? { background: block.color, borderColor: 'transparent' } : undefined}>
                  {block.text}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
