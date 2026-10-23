'use client';

import { useMemo, useRef } from 'react';
import { CONTENT_PAGE_SIZES, resolveBlockText, type ContentDocBlock, type ContentDocPage } from '@/lib/content/document';

/**
 * Studio free-canvas stage: blocks carry explicit geometry ({x,y,w,h}) and can
 * be dragged and resized independently via 8 handles. Pointer moves write
 * transforms/positions directly to the DOM; geometry commits on pointer-up.
 */

type Geometry = NonNullable<ContentDocBlock['geometry']>;

type Gesture = {
  kind: 'move' | 'resize';
  id: string;
  dir: string;
  startX: number;
  startY: number;
  origin: Geometry;
  next: Geometry;
};

const HANDLES = [
  { dir: 'n', cursor: 'ns-resize' },
  { dir: 's', cursor: 'ns-resize' },
  { dir: 'e', cursor: 'ew-resize' },
  { dir: 'w', cursor: 'ew-resize' },
  { dir: 'ne', cursor: 'nesw-resize' },
  { dir: 'nw', cursor: 'nwse-resize' },
  { dir: 'se', cursor: 'nwse-resize' },
  { dir: 'sw', cursor: 'nesw-resize' },
] as const;

export function StudioFreeCanvas({ page, zoom, offset, selectedId, canEdit, linkedValues, onSelect, onGeometryChange, stageRef, frameRef }: {
  page: ContentDocPage;
  zoom: number;
  offset: { x: number; y: number };
  selectedId: string | null;
  canEdit: boolean;
  linkedValues?: { title?: string | null; cta?: string | null };
  onSelect: (id: string) => void;
  onGeometryChange: (id: string, geometry: Geometry) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
  frameRef: React.RefObject<HTMLDivElement | null>;
}) {
  const gesture = useRef<Gesture | null>(null);
  const z = zoom / 100;
  const dims = CONTENT_PAGE_SIZES[page.size ?? 'a4'];

  const blocks = useMemo(() => page.blocks, [page.blocks]);
  const resolved = useMemo(
    () => blocks.map((block) => ({ block, text: block.type === 'text' || block.type === 'heading' || block.type === 'button' ? resolveBlockText(block, linkedValues) : '' })),
    [blocks, linkedValues],
  );

  const applyGesture = (id: string, next: Geometry) => {
    const el = frameRef.current?.querySelector<HTMLElement>(`[data-bid="${id}"]`);
    if (el) {
      el.style.left = `${next.x}px`;
      el.style.top = `${next.y}px`;
      el.style.width = `${next.w}px`;
      el.style.height = `${next.h}px`;
    }
    if (gesture.current) gesture.current.next = next;
  };

  const onBlockPointerDown = (event: React.PointerEvent, block: ContentDocBlock) => {
    onSelect(block.id);
    if (!canEdit || block.locked || !block.geometry) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    gesture.current = { kind: 'move', dir: '', id: block.id, startX: event.clientX, startY: event.clientY, origin: { ...block.geometry }, next: { ...block.geometry } };
  };

  const onHandlePointerDown = (event: React.PointerEvent, block: ContentDocBlock, dir: string) => {
    if (!block.geometry) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    gesture.current = { kind: 'resize', id: block.id, dir, startX: event.clientX, startY: event.clientY, origin: { ...block.geometry }, next: { ...block.geometry } };
  };

  const onStagePointerMove = (event: React.PointerEvent) => {
    const gestureState = gesture.current;
    if (!gestureState) return;
    const dx = (event.clientX - gestureState.startX) / z;
    const dy = (event.clientY - gestureState.startY) / z;
    const origin = gestureState.origin;
    let next: Geometry = { ...origin };
    if (gestureState.kind === 'move') {
      next = { ...origin, x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) };
    } else {
      const dir = gestureState.dir;
      let { x, y, w, h } = origin;
      if (dir.includes('e')) w = Math.max(24, Math.round(origin.w + dx));
      if (dir.includes('s')) h = Math.max(24, Math.round(origin.h + dy));
      if (dir.includes('w')) { w = Math.max(24, Math.round(origin.w - dx)); x = Math.round(origin.x + origin.w - w); }
      if (dir.includes('n')) { h = Math.max(24, Math.round(origin.h - dy)); y = Math.round(origin.y + origin.h - h); }
      next = { ...origin, x, y, w, h };
    }
    gestureState.next = next;
    applyGesture(gestureState.id, next);
  };

  const onStagePointerUp = () => {
    const gestureState = gesture.current;
    gesture.current = null;
    if (gestureState?.next) onGeometryChange(gestureState.id, gestureState.next);
  };

  return (
    <div
      ref={frameRef}
      className="studio-page-frame"
      style={{ width: dims.width, height: dims.height, transform: `translate(${offset.x}px, ${offset.y}px) scale(${z})`, ...(page.backgroundImage ? { backgroundImage: `url("${page.backgroundImage.src}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}) }}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
    >
      <span className="studio-page-label">
        {page.size === 'story' ? 'Story 9:16 · 760×1351' : page.size === 'square' ? 'Square · 760×760' : page.size === 'letter' ? 'US Letter · 816×1056' : 'A4 · 794×1123'}
      </span>
      {resolved.map(({ block, text }) => {
        const geo: Geometry = block.geometry ?? { x: 24, y: 24, w: Math.round(dims.width / 2), h: 80 };
        const isSelected = selectedId === block.id && canEdit && !block.locked;
        return (
          <div
            key={block.id}
            data-bid={block.id}
            className={`editor-free-block${isSelected ? ' is-selected' : ''}${block.hidden ? ' is-ghost' : ''}`}
            style={{ left: geo.x, top: geo.y, width: geo.w, height: geo.h, transform: geo.rotation ? `rotate(${geo.rotation}deg)` : undefined, cursor: canEdit && !block.locked ? 'move' : 'default' }}
            onPointerDown={(event) => onBlockPointerDown(event, block)}
            aria-label={`${block.type}: ${text.slice(0, 40)}`}
          >
            {block.type === 'heading' ? (
              <div className={`content-doc-heading align-${block.align} editor-level-${block.level}`} style={{ ...(block.color ? { color: block.color } : {}), ...(block.bg ? { background: block.bg, padding: '4px 8px', borderRadius: 6 } : {}), fontWeight: block.bold ? 800 : undefined, fontStyle: block.italic ? 'italic' : undefined, textDecoration: block.underline ? 'underline' : undefined, width: '100%', height: '100%', overflow: 'hidden' }}>
                {text}
              </div>
            ) : null}
            {block.type === 'text' ? (
              <div className={`content-doc-text size-${block.size} align-${block.align}`} style={{ ...(block.color ? { color: block.color } : {}), ...(block.bg ? { background: block.bg, padding: '6px 10px', borderRadius: 8 } : {}), fontWeight: block.bold ? 700 : undefined, fontStyle: block.italic ? 'italic' : undefined, textDecoration: block.underline ? 'underline' : undefined, width: '100%', height: '100%', overflow: 'hidden' }}>
                {text}
              </div>
            ) : null}
            {block.type === 'image' ? (
              <div style={{ width: '100%', height: '100%' }}>
                {/* URL validated to http(s) by the body schema. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={block.url} alt={block.alt} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, pointerEvents: 'none' }} />
              </div>
            ) : null}
            {block.type === 'shape' ? (
              <span className={`content-doc-shape-item is-${block.shape}`} style={{ background: block.color ?? 'var(--st-accent)', width: '100%', height: '100%', display: 'inline-block', pointerEvents: 'none' }} />
            ) : null}
            {block.type === 'button' ? (
              <span className={`content-doc-cta-button${block.color ? ' is-custom' : ''}`} style={{ ...(block.color ? { background: block.color, borderColor: 'transparent' } : {}), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', pointerEvents: 'none' }}>
                {text}
              </span>
            ) : null}
            {isSelected
              ? HANDLES.map(({ dir, cursor }) => (
                  <span
                    key={dir}
                    className={`st-free-handle st-handle-${dir}`}
                    style={{ cursor }}
                    onPointerDown={(event) => onHandlePointerDown(event, block, dir)}
                    onPointerMove={(event) => { if (gesture.current?.id === block.id && gesture.current.kind === 'resize') { event.stopPropagation(); } }}
                    onPointerUp={() => onStagePointerUp()}
                  />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}
