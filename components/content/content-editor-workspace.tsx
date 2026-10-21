'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Copy,
  Heading1,
  Image as ImageIcon,
  GripVertical,
  Layers,
  LoaderCircle,
  Minus,
  MousePointerClick,
  Pilcrow,
  Plus,
  Redo2,
  Save,
  Send,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import {
  CONTENT_DOC_MAX_BLOCKS,
  CONTENT_PAGE_SIZES,
  CONTENT_PAGE_SIZE_IDS,
  defaultPageSizeForType,
  CONTENT_DOC_MAX_PAGES,
  CONTENT_SHAPE_KINDS,
  contentBodyToPlainText,
  createDocumentFromText,
  newBlockId,
  newPage,
  parseContentBody,
  reorderBlocks,
  serializeContentDocument,
  type ContentDocBlock,
  type ContentDocPage,
  type ContentDocument,
  type ContentPageSizeId,
  type ContentShapeKind,
} from '@/lib/content/document';
import { ContentDocumentView } from '@/components/content/content-document-view';

/**
 * UpTrendifyOS visual content editor.
 *
 * A page-based editing workspace over the saved `uptrendify-doc` body: the
 * canvas is the document (one or more pages), the layer list is the active
 * page's order, the formatting bar edits the selected block, and the
 * properties panel holds the full controls. A version picker loads any saved
 * version. Saving persists the exact pages/blocks as a NEW content version
 * through the existing PATCH contract; submitting pins that version for
 * approval. Undo/redo operates on bounded serialized snapshots — no parallel
 * model.
 */

const BLOCK_LABEL: Record<EditorBlock['type'], string> = {
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
  shape: 'Shape',
  button: 'CTA button',
};

type EditorBlock = ContentDocBlock;

const HISTORY_LIMIT = 60;

function emptyBlock(type: EditorBlock['type']): EditorBlock {
  switch (type) {
    case 'heading':
      return { id: newBlockId('heading'), type, text: 'New heading', level: 2, align: 'left', color: null, bg: null, bold: false, italic: false, underline: false };
    case 'text':
      return { id: newBlockId('text'), type, text: 'Write here…', align: 'left', color: null, bg: null, size: 'md', bold: false, italic: false, underline: false };
    case 'image':
      return { id: newBlockId('image'), type, url: 'https://example.com/image.jpg', alt: '', align: 'center', width: 80 };
    case 'shape':
      return { id: newBlockId('shape'), type, shape: 'rectangle', color: null, align: 'center', width: 60, height: 120 };
    case 'button':
      return { id: newBlockId('button'), type, text: 'Call to action', href: null, color: null, align: 'center', width: 60 };
  }
}

const TYPE_ICON: Record<EditorBlock['type'], typeof Heading1> = {
  heading: Heading1,
  text: Pilcrow,
  image: ImageIcon,
  shape: Square,
  button: MousePointerClick,
};

function blockSummary(block: EditorBlock): string {
  if (block.type === 'image') return block.alt || 'Image';
  if (block.type === 'shape') return block.shape;
  return block.text.length > 42 ? `${block.text.slice(0, 42)}…` : block.text || BLOCK_LABEL[block.type];
}

/** Inline canvas text editing. Commits on blur or Enter (Shift+Enter = newline in multiline). */
function CanvasText({ value, disabled, multiline, onCommit, onClick }: {
  value: string;
  disabled: boolean;
  multiline: boolean;
  onCommit: (next: string) => void;
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (editing && ref.current && ref.current.innerText !== value) ref.current.innerText = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (editing) {
    return (
      <div
        ref={ref}
        role="textbox"
        tabIndex={0}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className="editor-inline-edit"
        onBlur={() => {
          setEditing(false);
          const next = (ref.current?.innerText ?? '').replace(/ /g, ' ').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
          onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            if (ref.current) ref.current.innerText = value;
            setEditing(false);
          }
          if (event.key === 'Enter' && (!multiline || !event.shiftKey)) {
            event.preventDefault();
            (event.currentTarget as HTMLElement).blur();
          }
          event.stopPropagation();
        }}
      />
    );
  }
  if (!value.trim()) {
    return (
      <div
        className="editor-canvas-text is-empty"
        onClick={() => { onClick(); if (!disabled) setEditing(true); }}
        title={disabled ? undefined : 'Click to add text'}
      >
        Empty text block — click to write.
      </div>
    );
  }
  return (
    <div
      className={`editor-canvas-text is-editable`}
      style={{ whiteSpace: 'pre-wrap' }}
      onClick={() => { onClick(); if (!disabled) setEditing(true); }}
      title={disabled ? undefined : 'Click to edit text'}
    >
      {value}
    </div>
  );
}

export function ContentEditorWorkspace({ brandId, contentId, documentTitle, contentType, versionNumber, body, canEdit, versions, currentVersionId }: {
  brandId: string;
  contentId: string;
  documentTitle: string;
  contentType: string | null;
  versionNumber: number;
  body: string;
  canEdit: boolean;
  versions: Array<{ id: string; version: number; body: string }>;
  currentVersionId: string | null;
}) {
  const router = useRouter();
  // The loaded document is derived exactly once so the canvas, the saved
  // snapshot and the history share identical block ids and page size — any
  // second derivation (fresh ids / different size default) would show a
  // permanent false "Unsaved changes".
  const initialDoc = useMemo(
    () => parseContentBody(body) ?? createDocumentFromText(body, defaultPageSizeForType(contentType)),
    [body, contentType],
  );
  const [pages, setPages] = useState<ContentDocPage[]>(() => initialDoc.pages);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadedVersionId, setLoadedVersionId] = useState<string | null>(currentVersionId);
  const [displayVersion, setDisplayVersion] = useState(versionNumber);
  const [dropTarget, setDropTarget] = useState<{ index: number; below: boolean } | null>(null);
  const dragIndex = useRef<number | null>(null);
  const saveInFlight = useRef(false);

  // The serialized snapshot of the version currently loaded on the canvas.
  // Derived ONCE per load (not per render): legacy plain-text bodies are
  // wrapped by createDocumentFromText, which mints fresh block ids each call —
  // recomputing it would make the canvas permanently compare unequal.
  const [loadedSnapshot, setLoadedSnapshot] = useState<string>(() => serializeContentDocument(initialDoc));
  const [history, setHistory] = useState<string[]>([serializeContentDocument(initialDoc)]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const activePage = pages[activePageIndex] ?? pages[0];
  const serialized = useMemo(
    () => serializeContentDocument({ kind: 'uptrendify-doc', version: 1, pages } satisfies ContentDocument),
    [pages],
  );
  const dirty = serialized !== loadedSnapshot;

  const selected = activePage?.blocks.find((block) => block.id === selectedId) ?? null;
  const selectedIndex = activePage?.blocks.findIndex((block) => block.id === selectedId) ?? -1;

  const commit = useCallback((nextPages: ContentDocPage[]) => {
    setPages(nextPages);
    const snapshot = serializeContentDocument({ kind: 'uptrendify-doc', version: 1, pages: nextPages } satisfies ContentDocument);
    setHistory((current) => {
      const truncated = current.slice(0, historyIndex + 1);
      if (truncated[truncated.length - 1] === snapshot) return truncated;
      const appended = [...truncated, snapshot];
      setHistoryIndex(appended.length - 1);
      return appended.length > HISTORY_LIMIT ? appended.slice(appended.length - HISTORY_LIMIT) : appended;
    });
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyIndex]);

  const patchPage = (pageIndex: number, transformer: (blocks: EditorBlock[]) => EditorBlock[]) => {
    commit(pages.map((page, index) => (index === pageIndex ? { ...page, blocks: transformer(page.blocks) } : page)));
  };
  const patchBlock = (id: string, patch: Partial<EditorBlock>) => {
    patchPage(activePageIndex, (current) => current.map((block) => (block.id === id ? ({ ...block, ...patch } as EditorBlock) : block)));
  };
  const addBlock = (type: EditorBlock['type'], shapeKind?: ContentShapeKind) => {
    const base = emptyBlock(type);
    const block = (type === 'shape' && shapeKind ? { ...base, type: 'shape', shape: shapeKind } : base) as EditorBlock;
    patchPage(activePageIndex, (current) => [...current, block]);
    setSelectedId(block.id);
    setPreviewMode(false);
  };
  const duplicateBlock = (id: string) => {
    const page = pages[activePageIndex];
    const index = page.blocks.findIndex((block) => block.id === id);
    if (index === -1 || page.blocks.length >= CONTENT_DOC_MAX_BLOCKS) return;
    const clone = { ...page.blocks[index], id: newBlockId(page.blocks[index].type) } as EditorBlock;
    patchPage(activePageIndex, (current) => [...current.slice(0, index + 1), clone, ...current.slice(index + 1)]);
    setSelectedId(clone.id);
  };
  const removeBlock = (id: string) => {
    if ((pages[activePageIndex]?.blocks.length ?? 0) <= 1 && pages.length === 1) return;
    patchPage(activePageIndex, (current) => current.filter((block) => block.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // Keyboard shortcuts (skips typing targets).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) setHistoryIndex((index) => {
          if (index >= history.length - 1) return index;
          const doc = parseContentBody(history[index + 1]);
          if (doc) setPages(doc.pages);
          return index + 1;
        });
        else setHistoryIndex((index) => {
          if (index <= 0) return index;
          const doc = parseContentBody(history[index - 1]);
          if (doc) setPages(doc.pages);
          return index - 1;
        });
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        setHistoryIndex((index) => {
          if (index >= history.length - 1) return index;
          const doc = parseContentBody(history[index + 1]);
          if (doc) setPages(doc.pages);
          return index + 1;
        });
        return;
      }
      if (typing || !selectedId || previewMode) return;
      if (meta && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        const key = event.key.toLowerCase() as 'b' | 'i' | 'u';
        const selectedBlock = pages[activePageIndex]?.blocks.find((block) => block.id === selectedId);
        if (selectedBlock && (selectedBlock.type === 'text' || selectedBlock.type === 'heading')) {
          if (key === 'b') patchBlock(selectedId, { bold: !selectedBlock.bold });
          if (key === 'i') patchBlock(selectedId, { italic: !selectedBlock.italic });
          if (key === 'u') patchBlock(selectedId, { underline: !selectedBlock.underline });
        }
        return;
      }
      if ((event.key === 'Backspace' || event.key === 'Delete')) {
        event.preventDefault();
        removeBlock(selectedId);
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateBlock(selectedId);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, previewMode, pages, history, historyIndex]);

  /** Load another saved version into the canvas (with unsaved-edit guard). */
  const switchVersion = (versionId: string) => {
    if (versionId === loadedVersionId) return;
    if (dirty && !window.confirm('Discard unsaved changes and open that version?')) return;
    const source = versions.find((entry) => entry.id === versionId);
    if (!source) return;
    const doc = parseContentBody(source.body) ?? createDocumentFromText(source.body, defaultPageSizeForType(contentType));
    const snapshot = serializeContentDocument(doc);
    setPages(doc.pages);
    setActivePageIndex(0);
    setSelectedId(null);
    setLoadedVersionId(versionId);
    setLoadedSnapshot(snapshot);
    setDisplayVersion(source.version);
    setHistory([snapshot]);
    setHistoryIndex(0);
    setSaved(false);
    setNotice(`Opened v${source.version}${versionId === currentVersionId ? ' (the current version)' : ''}. Saving creates a new version from it.`);
  };

  async function save() {
    if (saveInFlight.current || !canEdit || !dirty) return;
    saveInFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/content/${contentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: serialized }),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 401) { window.location.href = '/login'; return; }
      if (!response.ok) throw new Error(result?.error || 'Could not save the edited content');
      setLoadedVersionId(null); // Resolves to the new current version after refresh.
      setSaved(true);
      setNotice('Saved as the new current version. Approval and publishing now read exactly what is on the canvas.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the edited content');
    } finally {
      saveInFlight.current = false;
      setBusy(false);
    }
  }

  const submitForApproval = async () => {
    if (saveInFlight.current || submitting || !canEdit || dirty) return;
    // Only the current saved version may be submitted; viewing an older
    // version and submitting would pin the wrong content.
    if (loadedVersionId !== currentVersionId) {
      setError('This canvas shows an older version. Open the current version (or save it as a new version) before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brandId}/content/${contentId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'submit' }),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 401) { window.location.href = '/login'; return; }
      if (!response.ok) throw new Error(result?.error || 'Could not send content to the approval queue');
      router.push(`/brands/${brandId}/content/${contentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send content to the approval queue');
    } finally {
      setSubmitting(false);
    }
  };

  const canvasDrop = (index: number, event: React.DragEvent) => {
    event.preventDefault();
    if (dragIndex.current === null) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const below = event.clientY > rect.top + rect.height / 2;
    const from = dragIndex.current;
    let to = index + (below ? 1 : 0);
    if (from < to) to -= 1;
    setDropTarget(null);
    dragIndex.current = null;
    if (from === to) return;
    patchPage(activePageIndex, (current) => reorderBlocks(current, from, to));
  };

  const shapeButtons: Array<{ kind: ContentShapeKind; label: string }> = [
    { kind: 'rectangle', label: 'Rectangle' },
    { kind: 'square', label: 'Square' },
    { kind: 'circle', label: 'Circle' },
    { kind: 'triangle', label: 'Triangle' },
    { kind: 'star', label: 'Star' },
    { kind: 'pyramid', label: 'Pyramid' },
  ];

  return (
    <div className="editor-shell">
      <div className="editor-topbar">
        <Link href={`/brands/${brandId}/content/${contentId}`} className="editor-back" aria-label="Back to content detail">
          <ArrowLeft size={15} /> Back
        </Link>
        <div className="editor-topbar-title">
          <span className="eyebrow">UPTRENDIFY STUDIO</span>
          <strong>{documentTitle}</strong>
          <span className="editor-version">v{displayVersion}</span>
          {dirty ? <span className="editor-save-state is-dirty">Unsaved changes</span>
            : saved ? <span className="editor-save-state is-saved"><Check size={12} /> Saved</span>
            : <span className="editor-save-state">All changes saved</span>}
        </div>
        <div style={{ flex: 1 }} />
        {versions.length > 1 ? (
          <label className="editor-version-picker" title="Choose which saved content version to open">
            <span>Version</span>
            <select value={loadedVersionId ?? ''} onChange={(event) => switchVersion(event.target.value)} disabled={busy}>
              {versions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  v{entry.version}{entry.id === currentVersionId ? ' · current' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="editor-btn-group" role="group" aria-label="History">
          <button type="button" className="editor-btn" onClick={() => setHistoryIndex((index) => { if (index <= 0) return index; const doc = parseContentBody(history[index - 1]); if (doc) setPages(doc.pages); return index - 1; })} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
          <button type="button" className="editor-btn" onClick={() => setHistoryIndex((index) => { if (index >= history.length - 1) return index; const doc = parseContentBody(history[index + 1]); if (doc) setPages(doc.pages); return index + 1; })} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)"><Redo2 size={14} /></button>
        </div>
        <button type="button" className="editor-btn" onClick={() => setPreviewMode((value) => !value)} aria-pressed={previewMode}>
          {previewMode ? <><EyeOff size={14} /> Exit preview</> : <><Eye size={14} /> Preview</>}
        </button>
        <button type="button" className="editor-btn editor-btn-primary" onClick={() => void save()} disabled={busy || !canEdit || !dirty} title={!canEdit ? 'Editing is available in draft, after change requests, or after rejection.' : !dirty ? 'Nothing to save yet.' : undefined}>
          {busy ? <><LoaderCircle size={14} className="spin" /> Saving…</> : <><Save size={14} /> Save new version</>}
        </button>
        <button type="button" className="editor-btn editor-btn-submit" disabled={busy || submitting || !canEdit || dirty || loadedVersionId !== currentVersionId} title={dirty ? 'Save your edits first, then submit the exact saved version.' : loadedVersionId !== currentVersionId ? 'This canvas shows an older version. Open the current version before submitting.' : !canEdit ? 'Editing is not available in this status.' : 'Send this exact saved version to the approval queue.'} onClick={() => void submitForApproval()}>
          {submitting ? <><LoaderCircle size={14} className="spin" /> Sending…</> : <><Send size={14} /> Submit for approval</>}
        </button>
      </div>

      {notice ? <div className="editor-note is-ok" role="status">{notice}</div> : null}
      {error ? <div className="editor-note is-error" role="alert">{error}</div> : null}
      {!canEdit ? <div className="editor-note">Editing is available while the content is a draft, after change requests, or after rejection. Status changes happen in the Approval Queue.</div> : null}

      {/* Formatting bar (word-processor style, applied to the selected block). */}
      <div className="editor-formatbar" role="toolbar" aria-label="Formatting">
        {selected ? (
          <>
            <span className="editor-formatbar-target">{BLOCK_LABEL[selected.type]}</span>
            {selected.type === 'heading' ? (
              <span className="editor-formatbar-group">
                {([1, 2, 3] as const).map((level) => (
                  <button key={level} type="button" className={selected.level === level ? 'is-on' : ''} onClick={() => patchBlock(selected.id, { level })} disabled={!canEdit}>H{level}</button>
                ))}
              </span>
            ) : null}
            {selected.type === 'text' ? (
              <span className="editor-formatbar-group">
                {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                  <button key={size} type="button" className={selected.size === size ? 'is-on' : ''} onClick={() => patchBlock(selected.id, { size })} disabled={!canEdit}>{size.toUpperCase()}</button>
                ))}
              </span>
            ) : null}
            {selected.type === 'heading' || selected.type === 'text' ? (
              <>
                <span className="editor-formatbar-group">
                  <button type="button" className={selected.bold ? 'is-on' : ''} onClick={() => patchBlock(selected.id, { bold: !selected.bold })} disabled={!canEdit} title="Bold (applies to the whole block)"><strong>B</strong></button>
                  <button type="button" className={selected.italic ? 'is-on' : ''} onClick={() => patchBlock(selected.id, { italic: !selected.italic })} disabled={!canEdit} title="Italic"><em>I</em></button>
                  <button type="button" className={selected.underline ? 'is-on' : ''} onClick={() => patchBlock(selected.id, { underline: !selected.underline })} disabled={!canEdit} title="Underline"><u>U</u></button>
                </span>
                <span className="editor-formatbar-group">
                  <label className="editor-formatbar-color" title="Text colour">
                    <input type="color" value={selected.color ?? '#111111'} onChange={(event) => patchBlock(selected.id, { color: event.target.value })} disabled={!canEdit} aria-label="Text colour" />
                  </label>
                  <label className="editor-formatbar-color" title="Background colour">
                    <input type="color" value={selected.bg ?? '#ffffff'} onChange={(event) => patchBlock(selected.id, { bg: event.target.value })} disabled={!canEdit} aria-label="Background colour" />
                    <span>BG</span>
                  </label>
                </span>
              </>
            ) : null}
            {selected.type === 'shape' ? (
              <span className="editor-formatbar-group">
                {CONTENT_SHAPE_KINDS.map((kind) => (
                  <button key={kind} type="button" className={selected.shape === kind ? 'is-on' : ''} onClick={() => patchBlock(selected.id, { shape: kind })} disabled={!canEdit}>{kind}</button>
                ))}
              </span>
            ) : null}
            {selected.type === 'shape' || selected.type === 'button' ? (
              <span className="editor-formatbar-group">
                <label className="editor-formatbar-color" title="Fill colour">
                  <input type="color" value={selected.color ?? '#8b7cff'} onChange={(event) => patchBlock(selected.id, { color: event.target.value })} disabled={!canEdit} aria-label="Fill colour" />
                  <span>Fill</span>
                </label>
              </span>
            ) : null}
            <span className="editor-formatbar-group">
              {(['left', 'center', 'right'] as const).map((option) => (
                <button key={option} type="button" className={selected.align === option ? 'is-on' : ''} onClick={() => patchBlock(selected.id, { align: option })} disabled={!canEdit} title={`Align ${option}`}>{option === 'left' ? '⇤' : option === 'center' ? '≡' : '⇥'}</button>
              ))}
            </span>
            <span className="editor-formatbar-group">
              <button type="button" onClick={() => duplicateBlock(selected.id)} disabled={!canEdit} title="Duplicate (Ctrl+D)"><Copy size={12} /></button>
              <button type="button" className="is-danger" onClick={() => removeBlock(selected.id)} disabled={!canEdit} title="Delete"><Trash2 size={12} /></button>
            </span>
            <span className="editor-formatbar-meta">{selectedIndex >= 0 ? `${selectedIndex + 1}/` : ''}{activePage?.blocks.length ?? 0} on page {activePageIndex + 1}</span>
          </>
        ) : (
          <span className="editor-formatbar-target">Select a block to format it. Shapes, headings, text, images and CTAs can all be added from the left panel.</span>
        )}
      </div>

      <div className="editor-layout">
        <aside className="editor-layers" aria-label="Content blocks">
          <div className="editor-panel-label"><Layers size={13} /> Blocks · page {activePageIndex + 1}</div>
          {(activePage?.blocks ?? []).map((block, index) => {
            const Icon = TYPE_ICON[block.type];
            return (
              <div
                key={block.id}
                className={`editor-layer${selectedId === block.id ? ' is-selected' : ''}`}
                onClick={() => { setSelectedId(block.id); setPreviewMode(false); }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(block.id); setPreviewMode(false); } }}
                draggable={canEdit}
                onDragStart={(event) => { dragIndex.current = index; event.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); if (dragIndex.current !== null) { patchPage(activePageIndex, (current) => reorderBlocks(current, dragIndex.current ?? index, index)); dragIndex.current = null; } }}
                role="button"
                tabIndex={0}
              >
                <GripVertical size={11} className="editor-layer-grip" aria-hidden="true" />
                <Icon size={13} />
                <span className="editor-layer-label">{BLOCK_LABEL[block.type]}</span>
                <span className="editor-layer-summary">{blockSummary(block)}</span>
              </div>
            );
          })}
          <div className="editor-insert">
            <div className="editor-panel-label"><Plus size={13} /> Insert</div>
            {([
              { type: 'heading' as const, label: 'Heading', icon: Heading1 },
              { type: 'text' as const, label: 'Text', icon: Type },
              { type: 'image' as const, label: 'Image', icon: ImageIcon },
              { type: 'button' as const, label: 'CTA', icon: Square },
            ]).map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                type="button"
                className="editor-insert-btn"
                disabled={!canEdit || (activePage?.blocks.length ?? 0) >= CONTENT_DOC_MAX_BLOCKS}
                onClick={() => addBlock(type)}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          <div>
            <div className="editor-panel-label">Shapes</div>
            <div className="editor-shapes-row">
              {shapeButtons.map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  className="editor-shape-btn"
                  disabled={!canEdit || (activePage?.blocks.length ?? 0) >= CONTENT_DOC_MAX_BLOCKS}
                  onClick={() => addBlock('shape', kind)}
                  title={`Insert ${label.toLowerCase()}`}
                >
                  <span className={`editor-shape-swatch is-${kind}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className={`editor-canvas${previewMode ? ' is-preview' : ''}`} aria-label="Content canvas">
          <div className="editor-canvas-meta">
            <span className="editor-page-tabs" role="tablist" aria-label="Document pages">
              {pages.map((page, index) => (
                <button
                  key={page.id}
                  type="button"
                  role="tab"
                  aria-selected={index === activePageIndex}
                  className={`editor-page-tab${index === activePageIndex ? ' is-active' : ''}`}
                  onClick={() => { setActivePageIndex(index); setSelectedId(null); }}
                >
                  Page {index + 1}{page.blocks.length ? '' : ' ·'}
                </button>
              ))}
              <button
                type="button"
                className="editor-page-tab is-add"
                onClick={() => {
                  if (pages.length >= CONTENT_DOC_MAX_PAGES) return;
                  const page = newPage(activePage?.size ?? 'a4');
                  commit([...pages, page]);
                  setActivePageIndex(pages.length);
                  setSelectedId(null);
                  setPreviewMode(false);
                }}
                disabled={!canEdit || pages.length >= CONTENT_DOC_MAX_PAGES}
                title="Add a page"
              >
                <Plus size={11} /> Add page
              </button>
              {pages.length > 1 ? (
                <button
                  type="button"
                  className="editor-page-tab is-danger"
                  onClick={() => {
                    if (!window.confirm(`Delete page ${activePageIndex + 1}? Its blocks are removed from the document.`)) return;
                    commit(pages.filter((_, index) => index !== activePageIndex));
                    setActivePageIndex(0);
                    setSelectedId(null);
                  }}
                  disabled={!canEdit}
                  title="Delete this page"
                >
                  <Trash2 size={11} />
                </button>
              ) : null}
            </span>
            <label className="editor-size-picker" title="Canvas size">
              <span>Size</span>
              <select
                value={activePage?.size ?? 'a4'}
                disabled={!canEdit || previewMode}
                onChange={(event) => {
                const size = event.target.value as ContentPageSizeId;
                commit(pages.map((page, index) => (index === activePageIndex ? { ...page, size } : page)));
              }}
              >
                {CONTENT_PAGE_SIZE_IDS.map((id) => (
                  <option key={id} value={id}>{CONTENT_PAGE_SIZES[id].label}</option>
                ))}
              </select>
            </label>
            <span>UPTRENDIFY STUDIO · V{displayVersion}</span>
            <span className="editor-zoom">
              <button type="button" onClick={() => setZoom((z) => Math.max(60, z - 10))} aria-label="Zoom out" disabled={zoom <= 60}><Minus size={12} /></button>
              <span>{zoom}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(140, z + 10))} aria-label="Zoom in" disabled={zoom >= 140}><Plus size={12} /></button>
            </span>
          </div>
          <div className="editor-canvas-scroll">
            <div className={`editor-canvas-page size-${activePage?.size ?? 'a4'}`} style={{ zoom: `${zoom}%` }}>
              {(activePage?.blocks ?? []).length === 0 ? (
                <div className="editor-empty">
                  <Layers size={22} />
                  <strong>Empty page</strong>
                  <span>Add blocks from the left panel, or add another page.</span>
                </div>
              ) : null}
              {(activePage?.blocks ?? []).map((block, index) => {
                const isSelected = selectedId === block.id && !previewMode;
                const dropBefore = dropTarget?.index === index && !dropTarget.below;
                const dropAfter = dropTarget?.index === index && dropTarget.below;
                const textProps = { onClick: () => setSelectedId(block.id), onCommit: (next: string) => patchBlock(block.id, { text: next }) };
                return (
                  <div key={block.id} className="editor-drop-wrap">
                    {dropBefore ? <div className="editor-drop-line" /> : null}
                    <div
                      className={`editor-block${isSelected ? ' is-selected' : ''}`}
                      onClick={() => setSelectedId(block.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(block.id); } }}
                      draggable={canEdit}
                      onDragStart={(event) => { dragIndex.current = index; event.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(event) => { if (dragIndex.current !== null) { event.preventDefault(); setDropTarget({ index, below: event.clientY > (event.currentTarget as HTMLElement).getBoundingClientRect().bottom - 14 }); } }}
                      onDragLeave={() => setDropTarget((current) => (current?.index === index ? null : current))}
                      onDrop={(event) => canvasDrop(index, event)}
                    >
                      {isSelected && !previewMode ? (
                        <div className="editor-float-toolbar" onClick={(event) => event.stopPropagation()}>
                          {block.type === 'heading' ? (
                            <span className="editor-float-group">
                              {([1, 2, 3] as const).map((level) => (
                                <button key={level} type="button" className={block.level === level ? 'is-on' : ''} onClick={() => patchBlock(block.id, { level })} disabled={!canEdit}>H{level}</button>
                              ))}
                            </span>
                          ) : null}
                          {block.type === 'text' ? (
                            <span className="editor-float-group">
                              {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                                <button key={size} type="button" className={block.size === size ? 'is-on' : ''} onClick={() => patchBlock(block.id, { size })} disabled={!canEdit}>{size.toUpperCase()}</button>
                              ))}
                            </span>
                          ) : null}
                          {block.type === 'heading' || block.type === 'text' ? (
                            <span className="editor-float-group">
                              <button type="button" className={block.bold ? 'is-on' : ''} onClick={() => patchBlock(block.id, { bold: !block.bold })} disabled={!canEdit} title="Bold"><strong>B</strong></button>
                              <button type="button" className={block.italic ? 'is-on' : ''} onClick={() => patchBlock(block.id, { italic: !block.italic })} disabled={!canEdit} title="Italic"><em>I</em></button>
                              <button type="button" className={block.underline ? 'is-on' : ''} onClick={() => patchBlock(block.id, { underline: !block.underline })} disabled={!canEdit} title="Underline"><u>U</u></button>
                            </span>
                          ) : null}
                          <span className="editor-float-group">
                            {(['left', 'center', 'right'] as const).map((option) => (
                              <button key={option} type="button" className={block.align === option ? 'is-on' : ''} onClick={() => patchBlock(block.id, { align: option })} disabled={!canEdit} title={`Align ${option}`}>{option === 'left' ? '⇤' : option === 'center' ? '≡' : '⇥'}</button>
                            ))}
                          </span>
                          <span className="editor-float-group">
                            <button type="button" onClick={() => duplicateBlock(block.id)} disabled={!canEdit || (activePage?.blocks.length ?? 0) >= CONTENT_DOC_MAX_BLOCKS} title="Duplicate (Ctrl+D)"><Copy size={12} /></button>
                            <button type="button" className="is-danger" onClick={() => removeBlock(block.id)} disabled={!canEdit} title="Delete"><Trash2 size={12} /></button>
                          </span>
                          <span className="editor-float-meta">{index + 1}/{activePage?.blocks.length}</span>
                        </div>
                      ) : null}
                      {block.type === 'heading' ? (
                        <div className={`content-doc-heading align-${block.align} editor-level-${block.level}`} style={{ ...(block.color ? { color: block.color } : {}), ...(block.bg ? { background: block.bg } : {}), fontWeight: block.bold ? 800 : undefined, fontStyle: block.italic ? 'italic' : undefined, textDecoration: block.underline ? 'underline' : undefined }}>
                          <CanvasText value={block.text} disabled={!canEdit} multiline={false} onClick={textProps.onClick} onCommit={textProps.onCommit} />
                        </div>
                      ) : null}
                      {block.type === 'text' ? (
                        <div className={`content-doc-text size-${block.size} align-${block.align}`} style={{ ...(block.color ? { color: block.color } : {}), ...(block.bg ? { background: block.bg, padding: '6px 10px', borderRadius: 8 } : {}), fontWeight: block.bold ? 700 : undefined, fontStyle: block.italic ? 'italic' : undefined, textDecoration: block.underline ? 'underline' : undefined }}>
                          <CanvasText value={block.text} disabled={!canEdit} multiline onClick={textProps.onClick} onCommit={textProps.onCommit} />
                        </div>
                      ) : null}
                      {block.type === 'image' ? (
                        <div className={`content-doc-image align-${block.align}`}>
                          {/* Canvas preview; the URL is validated to http(s) by the body schema. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={block.url} alt={block.alt} style={{ width: `${block.width ?? 80}%` }} onError={(event) => { event.currentTarget.style.opacity = '0.3'; }} />
                        </div>
                      ) : null}
                      {block.type === 'shape' ? (
                        <div className={`content-doc-shape align-${block.align}`}>
                          <span className={`content-doc-shape-item is-${block.shape}`} style={{ background: block.color ?? 'var(--accent)', width: `${block.width ?? 60}%`, height: block.height }} />
                        </div>
                      ) : null}
                      {block.type === 'button' ? (
                        <div className={`content-doc-cta align-${block.align}`}>
                          <span className={`content-doc-cta-button${block.color ? ' is-custom' : ''}`} style={block.color ? { background: block.color, borderColor: 'transparent' } : undefined}>
                            {block.text}
                          </span>
                        </div>
                      ) : null}
                      {isSelected && !previewMode ? (
                        <>
                          <span className="editor-handle editor-handle-tl" />
                          <span className="editor-handle editor-handle-tr" />
                          <span className="editor-handle editor-handle-bl" />
                          <span className="editor-handle editor-handle-br" />
                        </>
                      ) : null}
                    </div>
                    {dropAfter ? <div className="editor-drop-line" /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="editor-properties" aria-label="Block properties">
          <div className="editor-panel-label">Properties</div>
          {!selected ? (
            <p className="editor-hint">Select a block on the canvas or in the layer list to edit its properties.</p>
          ) : (
            <div className="editor-props">
              <div className="editor-props-title"><MousePointerClick size={13} /> {BLOCK_LABEL[selected.type]}</div>

              {selected.type !== 'image' && selected.type !== 'shape' ? (
                <label className="editor-field">
                  <span>{selected.type === 'button' ? 'Button text' : 'Text'}</span>
                  {selected.type === 'text' ? (
                    <textarea value={selected.text} onChange={(event) => patchBlock(selected.id, { text: event.target.value })} disabled={!canEdit} rows={4} />
                  ) : (
                    <input value={selected.text} onChange={(event) => patchBlock(selected.id, { text: event.target.value })} disabled={!canEdit} />
                  )}
                </label>
              ) : null}

              {selected.type === 'heading' ? (
                <div className="editor-field">
                  <span>Level</span>
                  <div className="chip-row">
                    {([1, 2, 3] as const).map((level) => (
                      <button key={level} type="button" className={`chip chip-toggle${selected.level === level ? ' chip-toggle-active' : ''}`} onClick={() => patchBlock(selected.id, { level })} disabled={!canEdit}>H{level}</button>
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.type === 'text' ? (
                <div className="editor-field">
                  <span>Size</span>
                  <div className="chip-row">
                    {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                      <button key={size} type="button" className={`chip chip-toggle${selected.size === size ? ' chip-toggle-active' : ''}`} onClick={() => patchBlock(selected.id, { size })} disabled={!canEdit}>{size.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.type === 'shape' ? (
                <div className="editor-field">
                  <span>Shape</span>
                  <div className="chip-row">
                    {CONTENT_SHAPE_KINDS.map((kind) => (
                      <button key={kind} type="button" className={`chip chip-toggle${selected.shape === kind ? ' chip-toggle-active' : ''}`} onClick={() => patchBlock(selected.id, { shape: kind })} disabled={!canEdit}>{kind}</button>
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.type === 'image' ? (
                <>
                  <label className="editor-field">
                    <span>Image URL</span>
                    <input value={selected.url} onChange={(event) => patchBlock(selected.id, { url: event.target.value })} disabled={!canEdit} inputMode="url" placeholder="https://…" />
                  </label>
                  <label className="editor-field">
                    <span>Alt text</span>
                    <input value={selected.alt} onChange={(event) => patchBlock(selected.id, { alt: event.target.value })} disabled={!canEdit} placeholder="Describe the image" />
                  </label>
                </>
              ) : null}

              {selected.type === 'button' ? (
                <label className="editor-field">
                  <span>Destination URL</span>
                  <input value={selected.href ?? ''} onChange={(event) => patchBlock(selected.id, { href: event.target.value })} disabled={!canEdit} inputMode="url" placeholder="https://destination (optional)" />
                </label>
              ) : null}

              <div className="editor-field">
                <span>Alignment</span>
                <div className="chip-row">
                  {(['left', 'center', 'right'] as const).map((option) => (
                    <button key={option} type="button" className={`chip chip-toggle${selected.align === option ? ' chip-toggle-active' : ''}`} onClick={() => patchBlock(selected.id, { align: option })} disabled={!canEdit}>{option}</button>
                  ))}
                </div>
              </div>

              {selected.type === 'image' || selected.type === 'button' || selected.type === 'shape' ? (
                <label className="editor-field">
                  <span>Width · {selected.width ?? (selected.type === 'shape' ? 60 : 80)}%</span>
                  <input type="range" min={20} max={100} step={5} value={selected.width ?? (selected.type === 'shape' ? 60 : 80)} onChange={(event) => patchBlock(selected.id, { width: Number(event.target.value) })} disabled={!canEdit} />
                </label>
              ) : null}

              {selected.type === 'shape' ? (
                <label className="editor-field">
                  <span>Height · {selected.height}px</span>
                  <input type="range" min={24} max={480} step={12} value={selected.height} onChange={(event) => patchBlock(selected.id, { height: Number(event.target.value) })} disabled={!canEdit} />
                </label>
              ) : null}

              {selected.type !== 'image' ? (
                <div className="editor-field">
                  <span>{selected.type === 'shape' ? 'Fill colour' : 'Colour'}</span>
                  <div className="editor-color-row">
                    <input type="color" value={selected.color ?? '#111111'} onChange={(event) => patchBlock(selected.id, { color: event.target.value })} disabled={!canEdit} aria-label="Block colour" />
                    <button type="button" className="chip" onClick={() => patchBlock(selected.id, { color: null })} disabled={!canEdit || !selected.color}>Use theme default</button>
                  </div>
                </div>
              ) : null}

              {selected.type === 'heading' || selected.type === 'text' ? (
                <div className="editor-field">
                  <span>Background</span>
                  <div className="editor-color-row">
                    <input type="color" value={selected.bg ?? '#ffffff'} onChange={(event) => patchBlock(selected.id, { bg: event.target.value })} disabled={!canEdit} aria-label="Background colour" />
                    <button type="button" className="chip" onClick={() => patchBlock(selected.id, { bg: null })} disabled={!canEdit || !selected.bg}>No background</button>
                  </div>
                </div>
              ) : null}

              <button type="button" className="editor-remove" onClick={() => removeBlock(selected.id)} disabled={!canEdit}>
                <Trash2 size={13} /> Remove block
              </button>
              <p className="editor-hint">Drag blocks on the canvas or in the layer list to reorder. Ctrl+Z undo · Ctrl+D duplicate · Del remove.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
