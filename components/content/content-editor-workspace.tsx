'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BringToFront,
  Check,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Heading1,
  Pilcrow,
  Image as ImageIcon,
  Layers,
  LoaderCircle,
  Maximize,
  Minus,
  MousePointerClick,
  Plus,
  Redo2,
  Save,
  SendToBack,
  Send,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  Grid3X3,
} from 'lucide-react';
import {
  CONTENT_DOC_MAX_BLOCKS,
  CONTENT_DOC_MAX_PAGES,
  CONTENT_PAGE_SIZES,
  CONTENT_PAGE_SIZE_IDS,
  CONTENT_SHAPE_KINDS,
  createDocumentFromText,
  defaultPageSizeForType,
  newBlockId,
  newPage,
  parseContentBody,
  reorderBlocks,
  headingFontSizeForLevel,
  serializeContentDocument,
  type ContentDocBlock,
  type ContentDocPage,
  type ContentDocument,
  type ContentPageSizeId,
  type ContentShapeKind,
  type InlineTextRun,
} from '@/lib/content/document';
import { ContentDocumentView } from '@/components/content/content-document-view';
import { STUDIO_TEMPLATES, buildTemplatePage } from '@/lib/studio/templates';
import { importSvgTemplate, type SvgTemplateImport } from '@/lib/studio/import-template';
import { eraseRasterTextPixels, type RasterTextBounds } from '@/lib/studio/raster-text';
import { storyboardPagesFromScript } from '@/lib/content/parse-script';
import { lintBlocks, healthScore, channelLimit, type BrandLintIssue } from '@/lib/studio/brand-lint';
import { reflowPage, resolveBlockText } from '@/lib/content/document';
import { Clapperboard } from 'lucide-react';

/**
 * UpTrendifyOS Studio — full-bleed visual editor.
 *
 * Owns the viewport (fixed inset:0). The app shell stays in the DOM beneath;
 * the top-bar Back button replaces the sidebar navigation while editing.
 * Everything edits the saved `uptrendify-doc` version body; saving creates a
 * NEW version through the existing PATCH contract, and submission pins that
 * exact version for approval.
 */

const BLOCK_LABEL: Record<EditorBlock['type'], string> = {
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
  shape: 'Shape',
  button: 'CTA button',
};

type EditorBlock = ContentDocBlock;
type CanvasGeometry = NonNullable<EditorBlock['geometry']>;
type TextStyleSnapshot = {
  color?: string | null;
  bg?: string | null;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  fontSize?: number;
  fontFamily?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  level?: 1 | 2 | 3;
  opacity?: number;
};
type TextAssistAction = 'rewrite' | 'shorten' | 'expand' | 'tone' | 'translate';
type TextContextSubmenu = 'layer' | 'align' | 'heading' | 'component' | null;
type TextAssistState = { blockId: string; originalText: string; action: TextAssistAction; tone: string; targetLanguage: string; result: string; loading: boolean; error: string | null };
type StoredReusableTextComponent = { id: string; name: string; createdAt: number; type: 'heading' | 'text'; text: string; style: TextStyleSnapshot };
type LocalStudioDraft = {
  schemaVersion: 1;
  body: string;
  baseSnapshot: string;
  baseVersionId: string | null;
  activePageIndex: number;
  savedAt: number;
};
type RasterTextCandidate = {
  text: string;
  bounds: RasterTextBounds;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  italic?: boolean;
  underline?: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  backgroundKind?: 'solid' | 'gradient' | 'photo' | 'unknown';
  backgroundColor?: string | null;
  confidence: number;
  selected: boolean;
};
type RasterTextReview = {
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  dataUrl: string;
  width: number;
  height: number;
  components: RasterTextCandidate[];
  notes: string[];
};

const HISTORY_LIMIT = 80;

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

/** Inline canvas text editing. Commits on blur or Enter (Shift+Enter = newline in multiline). */
type InlineTextBaseStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string | null;
  bg?: string | null;
  fontSize?: number;
  fontFamily?: string;
};
type InlineTextFormatKey = 'bold' | 'italic' | 'underline' | 'color' | 'bg' | 'fontSize' | 'fontFamily';
type InlineTextFormatValue = boolean | string | number | null;
type InlineTextToolbarState = {
  left: number;
  top: number;
  start: number;
  end: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  bg: string;
  fontFamily: string;
  fontSize: number;
};
type InlineTextFormatAction = (key: InlineTextFormatKey, explicitValue?: InlineTextFormatValue) => void;
type InlineTextToolbarPrepare = () => void;
type InlineTextToolbarChange = (
  state: InlineTextToolbarState | null,
  apply: InlineTextFormatAction,
  prepare: InlineTextToolbarPrepare,
) => void;
type ActiveInlineTextToolbar = {
  blockId: string;
  state: InlineTextToolbarState;
  apply: InlineTextFormatAction;
  prepare: InlineTextToolbarPrepare;
};

function inlineRunStyle(run: InlineTextRun): React.CSSProperties {
  return {
    ...(run.bold !== undefined ? { fontWeight: run.bold ? 700 : 400 } : {}),
    ...(run.italic !== undefined ? { fontStyle: run.italic ? 'italic' : 'normal' } : {}),
    ...(run.underline !== undefined ? { textDecoration: run.underline ? 'underline' : 'none' } : {}),
    ...(run.color !== undefined ? { color: run.color ?? 'inherit' } : {}),
    ...(run.bg !== undefined ? { backgroundColor: run.bg ?? 'transparent' } : {}),
    ...(run.fontSize !== undefined ? { fontSize: String(run.fontSize) + 'px' } : {}),
    ...(run.fontFamily ? { fontFamily: run.fontFamily } : {}),
    whiteSpace: 'pre-wrap',
  };
}

function inlineStyleOnly(run: InlineTextRun): Omit<InlineTextRun, 'text'> {
  const { text: _text, ...style } = run;
  return style;
}

function sameInlineStyle(a: InlineTextRun, b: InlineTextRun): boolean {
  return (['bold', 'italic', 'underline', 'color', 'bg', 'fontSize', 'fontFamily'] as const)
    .every((key) => a[key] === b[key]);
}

function coalesceInlineTextRuns(runs: InlineTextRun[]): InlineTextRun[] {
  const result: InlineTextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = result[result.length - 1];
    if (previous && sameInlineStyle(previous, run)) previous.text += run.text;
    else result.push({ ...run });
  }
  return result;
}

function compatibleInlineTextRuns(value: string, runs?: InlineTextRun[]): InlineTextRun[] {
  if (runs?.length && runs.map((run) => run.text).join('') === value) return coalesceInlineTextRuns(runs);
  return value ? [{ text: value }] : [];
}

function appendInlineTextRuns(root: HTMLElement, runs: InlineTextRun[]): void {
  root.replaceChildren();
  for (const run of compatibleInlineTextRuns(runs.map((part) => part.text).join(''), runs)) {
    const styled = Object.keys(inlineStyleOnly(run)).some((key) => (run as unknown as Record<string, unknown>)[key] !== undefined);
    if (!styled) {
      root.appendChild(document.createTextNode(run.text));
      continue;
    }
    const span = document.createElement('span');
    const style = inlineRunStyle(run);
    if (style.fontWeight !== undefined) span.style.fontWeight = String(style.fontWeight);
    if (style.fontStyle !== undefined) span.style.fontStyle = String(style.fontStyle);
    if (style.textDecoration !== undefined) span.style.textDecoration = String(style.textDecoration);
    if (style.color !== undefined) span.style.color = String(style.color);
    if (style.backgroundColor !== undefined) span.style.backgroundColor = String(style.backgroundColor);
    if (style.fontSize !== undefined) span.style.fontSize = String(style.fontSize);
    if (style.fontFamily !== undefined) span.style.fontFamily = String(style.fontFamily);
    span.style.whiteSpace = 'pre-wrap';
    span.appendChild(document.createTextNode(run.text));
    root.appendChild(span);
  }
}

function cssColorToHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return ('#' + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3]).toLowerCase();
  }
  const match = trimmed.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!match) return null;
  const rgb = match.slice(1, 4).map((entry) => Math.max(0, Math.min(255, Number(entry))));
  return '#' + rgb.map((part) => part.toString(16).padStart(2, '0')).join('');
}

function readInlineTextRunsFromDom(root: HTMLElement): InlineTextRun[] {
  const collected: InlineTextRun[] = [];
  const push = (text: string, style: Omit<InlineTextRun, 'text'>) => {
    if (!text) return;
    const run = { text, ...style } as InlineTextRun;
    const previous = collected[collected.length - 1];
    if (previous && sameInlineStyle(previous, run)) previous.text += text;
    else collected.push(run);
  };

  const visit = (node: Node, inherited: Omit<InlineTextRun, 'text'> = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      push(node.nodeValue ?? '', inherited);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') {
      push('\n', inherited);
      return;
    }

    const style: Omit<InlineTextRun, 'text'> = { ...inherited };
    if (tag === 'b' || tag === 'strong') style.bold = true;
    if (tag === 'i' || tag === 'em') style.italic = true;
    if (tag === 'u') style.underline = true;
    if (tag === 'mark') style.bg = cssColorToHex(node.style.backgroundColor) ?? '#ffff00';

    const weight = node.style.fontWeight;
    if (weight) style.bold = weight === 'bold' || Number(weight) >= 600;
    const fontStyle = node.style.fontStyle;
    if (fontStyle) style.italic = fontStyle === 'italic';
    const decoration = node.style.textDecoration || node.style.textDecorationLine;
    if (decoration) style.underline = decoration.split(/\s+/).includes('underline');
    const color = cssColorToHex(node.style.color || node.getAttribute('color'));
    if (color) style.color = color;
    else if (node.style.color === 'inherit') style.color = null;
    const background = cssColorToHex(node.style.backgroundColor);
    if (background) style.bg = background;
    else if (node.style.backgroundColor === 'transparent') style.bg = null;
    const family = (node.style.fontFamily || node.getAttribute('face') || '').trim().replace(/^['"]|['"]$/g, '');
    if (family && !/[;{}<>]/.test(family)) style.fontFamily = family.slice(0, 120);
    const size = node.style.fontSize?.match(/^(\d+(?:\.\d+)?)px$/);
    if (size) style.fontSize = Math.max(8, Math.min(160, Math.round(Number(size[1]))));

    const isBlock = node !== root && (tag === 'div' || tag === 'p' || tag === 'li');
    if (isBlock && collected.length && !collected[collected.length - 1]!.text.endsWith('\n')) push('\n', inherited);
    for (const child of Array.from(node.childNodes)) visit(child, style);
  };

  for (const child of Array.from(root.childNodes)) visit(child);
  return coalesceInlineTextRuns(collected);
}

function normalizeInlineTextRuns(inputRuns: InlineTextRun[]): { text: string; runs: InlineTextRun[] } {
  type Unit = { char: string; style: Omit<InlineTextRun, 'text'> };
  const source: Unit[] = [];
  for (const run of inputRuns) {
    const style = inlineStyleOnly(run);
    for (let index = 0; index < run.text.length; index += 1) {
      source.push({ char: run.text[index]!, style });
    }
  }
  const normalized: Unit[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const unit = source[index]!;
    if (unit.char === '\r') {
      if (source[index + 1]?.char === '\n') index += 1;
      unit.char = '\n';
    }
    if (unit.char === '\n') {
      while (normalized.length && (normalized[normalized.length - 1]!.char === ' ' || normalized[normalized.length - 1]!.char === '\t')) normalized.pop();
      let trailingNewlines = 0;
      for (let cursor = normalized.length - 1; cursor >= 0 && normalized[cursor]!.char === '\n'; cursor -= 1) trailingNewlines += 1;
      if (trailingNewlines < 2) normalized.push(unit);
      continue;
    }
    normalized.push(unit);
  }
  while (normalized.length && normalized[normalized.length - 1]!.char.trim() === '') normalized.pop();
  while (normalized.length && normalized[0]!.char.trim() === '') normalized.shift();

  const output: InlineTextRun[] = [];
  for (const unit of normalized) {
    const run = { text: unit.char, ...unit.style } as InlineTextRun;
    const previous = output[output.length - 1];
    if (previous && sameInlineStyle(previous, run)) previous.text += run.text;
    else output.push(run);
  }
  return { text: output.map((run) => run.text).join(''), runs: output };
}

function textOffsetForDomPoint(root: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(container, offset);
    return range.toString().length;
  } catch {
    return 0;
  }
}

function domRangeForTextOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }
  if (!textNodes.length) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(true);
    return range;
  }
  const locate = (offset: number): { node: Text; offset: number } => {
    let remaining = Math.max(0, offset);
    for (const node of textNodes) {
      if (remaining <= node.data.length) return { node, offset: remaining };
      remaining -= node.data.length;
    }
    const last = textNodes[textNodes.length - 1]!;
    return { node: last, offset: last.data.length };
  };
  const range = document.createRange();
  const first = locate(start);
  const last = locate(end);
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset);
  return range;
}

function inlineSegmentsBetween(runs: InlineTextRun[], start: number, end: number) {
  const segments: Array<{ run: InlineTextRun; start: number; end: number }> = [];
  let cursor = 0;
  for (const run of runs) {
    const runEnd = cursor + run.text.length;
    if (runEnd > start && cursor < end) segments.push({ run, start: cursor, end: runEnd });
    cursor = runEnd;
  }
  return segments;
}

function formatInlineRuns(runs: InlineTextRun[], start: number, end: number, key: InlineTextFormatKey, value: InlineTextFormatValue): InlineTextRun[] {
  const updated: InlineTextRun[] = [];
  let cursor = 0;
  for (const run of runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;
    if (runEnd <= start || runStart >= end) {
      updated.push({ ...run });
      continue;
    }
    const selectedStart = Math.max(0, start - runStart);
    const selectedEnd = Math.min(run.text.length, end - runStart);
    if (selectedStart > 0) updated.push({ ...run, text: run.text.slice(0, selectedStart) });
    updated.push({ ...run, text: run.text.slice(selectedStart, selectedEnd), [key]: value } as InlineTextRun);
    if (selectedEnd < run.text.length) updated.push({ ...run, text: run.text.slice(selectedEnd) });
  }
  return coalesceInlineTextRuns(updated);
}

function getInlineToolbarState(root: HTMLElement, range: Range, baseStyle: InlineTextBaseStyle): InlineTextToolbarState | null {
  const start = textOffsetForDomPoint(root, range.startContainer, range.startOffset);
  const end = textOffsetForDomPoint(root, range.endContainer, range.endOffset);
  if (end <= start) return null;
  const runs = readInlineTextRunsFromDom(root);
  const segments = inlineSegmentsBetween(runs, start, end);
  if (!segments.length) return null;
  const computed = window.getComputedStyle(root);
  const computedColor = cssColorToHex(computed.color) ?? '#111827';
  const computedSize = Number.parseInt(computed.fontSize, 10) || 16;
  const computedFamily = computed.fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || 'Inter';
  const base = {
    bold: baseStyle.bold ?? false,
    italic: baseStyle.italic ?? false,
    underline: baseStyle.underline ?? false,
    color: baseStyle.color ?? computedColor,
    bg: baseStyle.bg ?? null,
    fontSize: baseStyle.fontSize ?? computedSize,
    fontFamily: baseStyle.fontFamily ?? computedFamily,
  };
  const all = <K extends InlineTextFormatKey,>(key: K): Array<InlineTextRun[K]> =>
    segments.map(({ run }) => (run[key] === undefined ? base[key] : run[key]) as InlineTextRun[K]);
  const common = <T,>(values: T[]): T | undefined => values.every((value) => value === values[0]) ? values[0] : undefined;
  const color = common(all('color').map((value) => value == null ? base.color : value)) ?? base.color;
  const bgValue = common(all('bg').map((value) => value === undefined ? base.bg : value));
  const fontSize = common(all('fontSize').map((value) => value ?? base.fontSize)) ?? base.fontSize;
  const fontFamily = common(all('fontFamily').map((value) => value ?? base.fontFamily)) ?? base.fontFamily;
  const rect = range.getBoundingClientRect();
  return {
    left: Math.max(8, Math.min(window.innerWidth - 440, rect.left + rect.width / 2 - 216)),
    top: Math.max(8, rect.top - 52),
    start,
    end,
    bold: all('bold').every((value) => value === true),
    italic: all('italic').every((value) => value === true),
    underline: all('underline').every((value) => value === true),
    color: typeof color === 'string' ? color : '#111827',
    bg: typeof bgValue === 'string' ? bgValue : '#fff59d',
    fontFamily,
    fontSize,
  };
}

/** Inline canvas editor. Selected ranges get their own formatting runs, not block-level styles. */
function CanvasText({
  value,
  richText,
  baseStyle,
  disabled,
  multiline,
  onCommit,
  onClick,
  onDraftInput,
  onInlineToolbarChange,
  editOnDoubleClick = false,
  editRequest = 0,
  onEditingEnd,
}: {
  value: string;
  richText?: InlineTextRun[];
  baseStyle?: InlineTextBaseStyle;
  disabled: boolean;
  multiline: boolean;
  onCommit: (next: string, runs?: InlineTextRun[]) => void;
  onClick: () => void;
  onDraftInput?: (next: string, runs?: InlineTextRun[]) => void;
  onInlineToolbarChange?: InlineTextToolbarChange;
  editOnDoubleClick?: boolean;
  editRequest?: number;
  onEditingEnd?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const selectWordOnEditRef = useRef(false);
  const preserveSelectionRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const editPoint = useRef<{ x: number; y: number } | null>(null);
  const baseStyleRef = useRef(baseStyle);
  baseStyleRef.current = baseStyle;
  const onDraftInputRef = useRef(onDraftInput);
  onDraftInputRef.current = onDraftInput;
  const onInlineToolbarChangeRef = useRef(onInlineToolbarChange);
  onInlineToolbarChangeRef.current = onInlineToolbarChange;
  const applyInlineFormatRef = useRef<InlineTextFormatAction>(() => {});
  const prepareToolbarInteractionRef = useRef<InlineTextToolbarPrepare>(() => {});
  const notifyInlineToolbarChange = (state: InlineTextToolbarState | null) => {
    onInlineToolbarChangeRef.current?.(state, applyInlineFormatRef.current, prepareToolbarInteractionRef.current);
  };
  const isInlineToolbarFocused = () => {
    const toolbar = document.querySelector('.studio-float[data-inline-selection="true"]');
    return Boolean(toolbar?.contains(document.activeElement));
  };
  const prepareToolbarInteraction = () => {
    preserveSelectionRef.current = true;
    const editable = ref.current;
    const selection = window.getSelection();
    if (editable && selection?.rangeCount && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      if (editable.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
    }
  };
  prepareToolbarInteractionRef.current = prepareToolbarInteraction;

  const refreshInlineToolbar = (rangeOverride?: Range | null) => {
    const editable = ref.current;
    if (!editable) return;
    const selection = window.getSelection();
    const range = rangeOverride ?? (selection?.rangeCount ? selection.getRangeAt(0) : null);
    if (!range || range.collapsed || !editable.contains(range.commonAncestorContainer)) {
      if (preserveSelectionRef.current && isInlineToolbarFocused()) return;
      notifyInlineToolbarChange(null);
      return;
    }
    savedRangeRef.current = range.cloneRange();
    const next = getInlineToolbarState(editable, range, baseStyleRef.current ?? {});
    notifyInlineToolbarChange(next);
  };

  const beginEditing = (event?: React.MouseEvent<HTMLDivElement>, selectWord = false) => {
    if (event) editPoint.current = { x: event.clientX, y: event.clientY };
    selectWordOnEditRef.current = selectWord;
    setEditing(true);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onClick();
    if (disabled || editOnDoubleClick) return;
    beginEditing(event);
  };

  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) beginEditing(event, true);
  };

  useEffect(() => {
    if (editRequest > 0 && !disabled) setEditing(true);
  }, [editRequest, disabled]);

  const finishEditing = () => {
    const editable = ref.current;
    const rawRuns = editable ? readInlineTextRunsFromDom(editable) : compatibleInlineTextRuns(value, richText);
    const normalized = normalizeInlineTextRuns(rawRuns);
    setEditing(false);
    notifyInlineToolbarChange(null);
    savedRangeRef.current = null;
    preserveSelectionRef.current = false;
    onEditingEnd?.();
    onCommit(normalized.text, normalized.runs);
  };

  const updateDraftFromDom = (editable: HTMLElement) => {
    const runs = readInlineTextRunsFromDom(editable);
    const next = runs.map((run) => run.text).join('');
    const selection = window.getSelection();
    if (selection?.rangeCount && !selection.isCollapsed && editable.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    onDraftInputRef.current?.(next, runs);
  };

  const applyInlineFormat = (key: InlineTextFormatKey, explicitValue?: InlineTextFormatValue) => {
    const editable = ref.current;
    const savedRange = savedRangeRef.current;
    if (!editable || !savedRange || !editable.contains(savedRange.commonAncestorContainer)) return;
    const start = textOffsetForDomPoint(editable, savedRange.startContainer, savedRange.startOffset);
    const end = textOffsetForDomPoint(editable, savedRange.endContainer, savedRange.endOffset);
    if (end <= start) return;
    const currentRuns = readInlineTextRunsFromDom(editable);
    const segments = inlineSegmentsBetween(currentRuns, start, end);
    if (!segments.length) return;

    let nextValue = explicitValue;
    if (nextValue === undefined) {
      const base = baseStyleRef.current ?? {};
      const allActive = segments.every(({ run }) => {
        const runValue = run[key];
        const baseValue = base[key];
        return (runValue === undefined ? baseValue : runValue) === true;
      });
      nextValue = !allActive;
    }

    const formatted = formatInlineRuns(currentRuns, start, end, key, nextValue);
    const nextText = formatted.map((run) => run.text).join('');
    appendInlineTextRuns(editable, formatted);
    const nextRange = domRangeForTextOffsets(editable, start, end);
    if (nextRange) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(nextRange);
      savedRangeRef.current = nextRange.cloneRange();
      refreshInlineToolbar(nextRange);
    }
    preserveSelectionRef.current = false;
    onDraftInputRef.current?.(nextText, formatted);
    editable.focus({ preventScroll: true });
  };

  applyInlineFormatRef.current = applyInlineFormat;

  const insertNewlineAtSelection = (editable: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editable.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    const newline = document.createTextNode('\n');
    range.insertNode(newline);
    range.setStartAfter(newline);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const selectWordAtPoint = (editable: HTMLElement, point: { x: number; y: number } | null) => {
    if (!point) return false;
    const caretDocument = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let caretRange = caretDocument.caretRangeFromPoint?.(point.x, point.y) ?? null;
    if (!caretRange && caretDocument.caretPositionFromPoint) {
      const position = caretDocument.caretPositionFromPoint(point.x, point.y);
      if (position) {
        caretRange = document.createRange();
        caretRange.setStart(position.offsetNode, position.offset);
        caretRange.collapse(true);
      }
    }
    if (!caretRange || !editable.contains(caretRange.startContainer)) return false;
    const offset = textOffsetForDomPoint(editable, caretRange.startContainer, caretRange.startOffset);
    const rawText = readInlineTextRunsFromDom(editable).map((run) => run.text).join('');
    let chosen: { start: number; end: number } | null = null;
    const wordPattern = /[\p{L}\p{N}_]+/gu;
    for (const match of rawText.matchAll(wordPattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if ((offset >= start && offset < end) || (offset === end && start > 0)) {
        chosen = { start, end };
        break;
      }
    }
    if (!chosen) return false;
    const range = domRangeForTextOffsets(editable, chosen.start, chosen.end);
    if (!range) return false;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = range.cloneRange();
    refreshInlineToolbar(range);
    return true;
  };

  useLayoutEffect(() => {
    if (!editing || !ref.current) return;
    const editable = ref.current;
    const compatible = compatibleInlineTextRuns(value, richText);
    if (editable.childNodes.length === 0 || readInlineTextRunsFromDom(editable).map((run) => run.text).join('') !== value) {
      appendInlineTextRuns(editable, compatible);
    }
    editable.focus({ preventScroll: true });

    const selection = window.getSelection();
    const point = editPoint.current;
    const caretDocument = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const pointRange = point && caretDocument.caretRangeFromPoint
      ? caretDocument.caretRangeFromPoint(point.x, point.y)
      : null;
    let insertedSelection = false;
    if (pointRange && editable.contains(pointRange.startContainer)) {
      selection?.removeAllRanges();
      selection?.addRange(pointRange);
      insertedSelection = true;
    } else {
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    if (selectWordOnEditRef.current && point) {
      if (!selectWordAtPoint(editable, point)) {
        if (!insertedSelection && selection?.rangeCount) {
          const fallbackRange = selection.getRangeAt(0);
          savedRangeRef.current = fallbackRange.cloneRange();
        }
      }
    }
    editPoint.current = null;
    selectWordOnEditRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    if (!editing) {
      notifyInlineToolbarChange(null);
      return;
    }
    const updateSelection = () => {
      const editable = ref.current;
      if (!editable) return;
      if (preserveSelectionRef.current && isInlineToolbarFocused()) return;
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) {
        if (!isInlineToolbarFocused()) notifyInlineToolbarChange(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!editable.contains(range.commonAncestorContainer)) {
        if (!isInlineToolbarFocused()) notifyInlineToolbarChange(null);
        return;
      }
      refreshInlineToolbar(range);
    };
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
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
        onMouseUp={() => refreshInlineToolbar()}
        onKeyUp={() => refreshInlineToolbar()}
        onInput={(event) => updateDraftFromDom(event.currentTarget)}
        onBlur={(event) => {
          const toolbar = document.querySelector('.studio-float[data-inline-selection="true"]');
          if (event.relatedTarget instanceof Node && toolbar?.contains(event.relatedTarget)) return;
          finishEditing();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            if (ref.current) appendInlineTextRuns(ref.current, compatibleInlineTextRuns(value, richText));
            setEditing(false);
            notifyInlineToolbarChange(null);
            savedRangeRef.current = null;
            preserveSelectionRef.current = false;
            onEditingEnd?.();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (multiline) {
              insertNewlineAtSelection(event.currentTarget);
              updateDraftFromDom(event.currentTarget);
              refreshInlineToolbar();
            } else {
              (event.currentTarget as HTMLElement).blur();
            }
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
        onClick={handleCanvasClick} onDoubleClick={handleCanvasDoubleClick}
        title={disabled ? undefined : editOnDoubleClick ? 'Double-click to write directly on the canvas' : 'Click to write directly'}
      >
        Empty text block — click to write.
      </div>
    );
  }
  return (
    <div
      className="editor-canvas-text is-editable"
      style={{ whiteSpace: 'pre-wrap' }}
      onClick={handleCanvasClick} onDoubleClick={handleCanvasDoubleClick}
      title={disabled ? undefined : editOnDoubleClick ? 'Double-click to edit text directly on the canvas' : 'Click to edit text directly'}
    >
      {compatibleInlineTextRuns(value, richText).map((run, index) => (
        <span key={index} style={inlineRunStyle(run)}>{run.text}</span>
      ))}
    </div>
  );
}

const TYPE_ICON: Record<EditorBlock['type'], typeof Heading1> = {
  heading: Heading1,
  text: Pilcrow,
  image: ImageIcon,
  shape: Square,
  button: MousePointerClick,
};

function blockName(block: EditorBlock): string {
  if (block.type === 'image') return 'Image';
  if (block.type === 'shape') return `Shape · ${block.shape}`;
  if (block.type === 'button') return block.text || 'CTA button';
  const trimmed = block.text.trim();
  if (!trimmed) return `${BLOCK_LABEL[block.type]} (empty)`;
  return trimmed.length > 36 ? `${trimmed.slice(0, 36)}…` : trimmed;
}

function defaultFontSize(block: EditorBlock): number {
  if (block.type === 'heading') return headingFontSizeForLevel(block.level);
  if (block.type === 'text') return block.size === 'sm' ? 13 : block.size === 'md' ? 15 : block.size === 'lg' ? 18 : 24;
  return 16;
}

function normalizeHttpImageUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeHttpLinkUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeStudioAssetPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  return /^\/api\/brands\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/content\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path) ? path : null;
}

const contextMenuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  width: '100%', minHeight: 32, padding: '7px 9px', border: 0, borderRadius: 5,
  background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', fontSize: 12,
};
const contextMenuShortcutStyle: React.CSSProperties = {
  marginLeft: 'auto', color: 'var(--muted, #756f63)', fontSize: 10, whiteSpace: 'nowrap',
};
const contextMenuDividerStyle: React.CSSProperties = {
  height: 1, margin: '5px 5px', background: 'var(--line, #e2dbcf)',
};
const contextMenuSubmenuStyle: React.CSSProperties = {
  margin: '2px 0 4px 10px', paddingLeft: 5, borderLeft: '2px solid var(--line, #e2dbcf)',
};

function clampCanvasCoordinate(value: number): number {
  return Math.max(-2000, Math.min(4000, Math.round(value)));
}

function clampCanvasSize(value: number): number {
  return Math.max(24, Math.min(4000, Math.round(value)));
}

/** Convert flow-only blocks to non-overlapping page geometry before enabling free canvas mode. */
function layoutPageForFreeCanvas(page: ContentDocPage): ContentDocPage {
  const dims = CONTENT_PAGE_SIZES[page.size ?? 'a4'];
  const margin = 32;
  const usableWidth = Math.max(200, dims.width - margin * 2);
  let cursorY = Math.max(margin, ...page.blocks.flatMap((block) => block.geometry ? [block.geometry.y + block.geometry.h + 24] : []));

  const blocks = page.blocks.map((block) => {
    if (block.geometry) return block;
    let width = usableWidth;
    let height = 72;
    const textValue = block.type === 'heading' || block.type === 'text' || block.type === 'button' ? block.text : '';
    const fontSize = block.type === 'heading'
      ? block.fontSize ?? (block.level === 1 ? 36 : block.level === 2 ? 28 : 22)
      : block.type === 'text' ? block.fontSize ?? defaultFontSize(block) : 16;

    if (block.type === 'heading' || block.type === 'text') {
      // Keep short text boxes content-sized instead of giving every block the
      // full page width. Long paragraphs still grow up to the usable page width.
      const longestLine = textValue.split(/\r?\n/).reduce((longest, line) => Math.max(longest, line.length), 0);
      width = Math.min(usableWidth, Math.max(220, Math.ceil(longestLine * fontSize * 0.54 + 24)));
      const charsPerLine = Math.max(12, Math.floor(width / Math.max(7, fontSize * 0.54)));
      const lineCount = textValue.split(/\r?\n/).reduce(
        (total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)),
        0,
      );
      height = Math.min(420, Math.max(fontSize * 1.6 + 12, lineCount * fontSize * 1.45 + 12));
    } else if (block.type === 'image') {
      width = Math.round(usableWidth * ((block.width ?? 80) / 100));
      height = Math.max(120, Math.min(Math.round(dims.height * 0.36), Math.round(width * 0.62)));
    } else if (block.type === 'shape') {
      width = Math.round(usableWidth * ((block.width ?? 60) / 100));
      height = Math.max(24, block.height ?? 120);
    } else {
      width = Math.round(usableWidth * ((block.width ?? 60) / 100));
      height = 56;
    }

    const align = block.align ?? 'left';
    const x = align === 'center' ? Math.round((dims.width - width) / 2) : align === 'right' ? dims.width - margin - width : margin;
    const y = Math.min(3800, cursorY);
    cursorY = Math.min(4000, y + height + 24);
    return { ...block, geometry: { x, y, w: width, h: height } } as EditorBlock;
  });
  return { ...page, blocks };
}

/** Place newly inserted free-canvas elements at usable, independent dimensions. */
function defaultGeometryForNewBlock(block: EditorBlock, page: ContentDocPage): CanvasGeometry {
  const dims = CONTENT_PAGE_SIZES[page.size ?? 'a4'];
  const margin = 32;
  const usableWidth = Math.max(200, dims.width - margin * 2);
  const y = Math.min(3800, Math.max(margin, ...page.blocks.flatMap((entry) =>
    entry.geometry ? [entry.geometry.y + entry.geometry.h + 18] : [],
  )));
  let w = Math.min(usableWidth, 360);
  let h = 96;
  if (block.type === 'heading') {
    w = Math.min(usableWidth, Math.max(220, Math.ceil(block.text.length * defaultFontSize(block) * 0.54 + 24)));
    h = 68;
  } else if (block.type === 'text') {
    w = Math.min(usableWidth, Math.max(220, Math.ceil(Math.min(block.text.length, 90) * defaultFontSize(block) * 0.54 + 24)));
    h = 112;
  } else if (block.type === 'shape') {
    w = Math.round(usableWidth * ((block.width ?? 60) / 100));
    h = block.height ?? 120;
  } else if (block.type === 'button') {
    w = Math.round(usableWidth * ((block.width ?? 60) / 100));
    h = 56;
  } else if (block.type === 'image') {
    w = Math.round(usableWidth * ((block.width ?? 80) / 100));
    h = Math.max(120, Math.round(w * 0.62));
  }
  return { x: margin, y, w: clampCanvasSize(w), h: clampCanvasSize(h) };
}

function fitZoom(stage: { w: number; h: number }, page: { w: number; h: number }, pad = 56): number {
  return Math.min((stage.w - pad * 2) / page.w, (stage.h - pad * 2) / page.h, 1.5);
}
function centerOffset(stage: { w: number; h: number }, page: { w: number; h: number }, z: number): { x: number; y: number } {
  return { x: (stage.w - page.w * z) / 2, y: (stage.h - page.h * z) / 2 };
}

export function ContentEditorWorkspace({ brandId, contentId, documentTitle, contentType, channel, itemCta, brand, versionNumber, body, canEdit, versions, currentVersionId }: {
  brandId: string;
  contentId: string;
  documentTitle: string;
  contentType: string | null;
  channel: string | null;
  itemCta: string | null;
  brand: { colors: string[]; fonts: string[] };
  versionNumber: number;
  body: string;
  canEdit: boolean;
  versions: Array<{ id: string; version: number; body: string; cta?: string | null }>;
  currentVersionId: string | null;
}) {
  const router = useRouter();
  const studioRootRef = useRef<HTMLDivElement | null>(null);
  const [studioHeight, setStudioHeight] = useState<number | null>(null);
  const isStoryboard = contentType === 'video_script';
  const initialDoc = useMemo(() => {
    const saved = parseContentBody(body);
    const source = saved ?? (isStoryboard && body.trim()
      ? { kind: 'uptrendify-doc' as const, version: 1 as const, mode: 'free' as const, pages: storyboardPagesFromScript(body, defaultPageSizeForType(contentType)) }
      : createDocumentFromText(body, defaultPageSizeForType(contentType)));
    // The visual editor opens in free-canvas mode so every selected block can
    // be moved and resized before the user inserts an image.
    return {
      ...source,
      mode: 'free' as const,
      pages: source.pages.map((page) => layoutPageForFreeCanvas(page)),
    };
  }, [body, contentType, isStoryboard]);
  const [pages, setPages] = useState<ContentDocPage[]>(() => initialDoc.pages);
  const [freeMode, setFreeMode] = useState(initialDoc.mode === 'free');
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [zoomManual, setZoomManual] = useState(false);

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [gridOn, setGridOn] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [dockTab, setDockTab] = useState<'layers' | 'insert' | 'brand' | 'ai' | 'scenes' | null>('layers');
  const [inspectorTab, setInspectorTab] = useState<'design' | 'arrange' | 'brand' | 'ai' | 'templates'>('design');
  const [drawerSearch, setDrawerSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localDraftReady, setLocalDraftReady] = useState(false);
  const [localDraftSaved, setLocalDraftSaved] = useState(false);
  const [draftRecoveryCandidate, setDraftRecoveryCandidate] = useState<LocalStudioDraft | null>(null);
  const localDraftKey = `uptrendify-studio-draft-v1:${brandId}:${contentId}`;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadedVersionId, setLoadedVersionId] = useState<string | null>(currentVersionId);
  const loadedBaselineVersionIdRef = useRef<string | null>(currentVersionId);
  const [displayVersion, setDisplayVersion] = useState(versionNumber);
  const [dropTarget, setDropTarget] = useState<{ index: number; below: boolean } | null>(null);
  const [overflow, setOverflow] = useState(false);
  const [safeZones, setSafeZones] = useState(false);
  const [duplicateSize, setDuplicateSize] = useState<ContentPageSizeId>('square');
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const [imageAltDraft, setImageAltDraft] = useState('');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState('');
  const [showBackgroundImageUrlInput, setShowBackgroundImageUrlInput] = useState(false);
  const [backgroundPreviewOpen, setBackgroundPreviewOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isImportingTemplate, setIsImportingTemplate] = useState(false);
  const [rasterReview, setRasterReview] = useState<RasterTextReview | null>(null);
  const [isApplyingRasterText, setIsApplyingRasterText] = useState(false);
  const [textContextMenu, setTextContextMenu] = useState<{ blockId: string; left: number; top: number; submenu: TextContextSubmenu; submenuLeft?: number; submenuTop?: number } | null>(null);
  const [inlineTextEditRequest, setInlineTextEditRequest] = useState<{ blockId: string; sequence: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const contextSubmenuRef = useRef<HTMLDivElement | null>(null);
  const [copiedTextStyle, setCopiedTextStyle] = useState<TextStyleSnapshot | null>(null);
  const internalTextClipboardRef = useRef<string | null>(null);
  const [textAssist, setTextAssist] = useState<TextAssistState | null>(null);
  const reusableTextComponentsKey = `uptrendify-studio-components-v1:${brandId}`;
  const [reusableTextComponents, setReusableTextComponents] = useState<StoredReusableTextComponent[]>([]);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);
  const [floatAnchor, setFloatAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [inlineSelectionToolbar, setInlineSelectionToolbar] = useState<ActiveInlineTextToolbar | null>(null);
  const dragIndex = useRef<number | null>(null);
  const freeDrag = useRef<{ id: string; pointerId: number; startX: number; startY: number; scale: number; moved: boolean; origin: CanvasGeometry } | null>(null);
  const freeResize = useRef<{ id: string; dir: string; startX: number; startY: number; origin: CanvasGeometry; next: CanvasGeometry } | null>(null);
  const saveInFlight = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stagePointerRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<HTMLDivElement | null>(null);
  const manualZoomRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const spaceHeld = useRef(false);

  const [history, setHistory] = useState<string[]>([serializeContentDocument(initialDoc)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [loadedSnapshot, setLoadedSnapshot] = useState<string>(() => serializeContentDocument(initialDoc));

  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useLayoutEffect(() => {
    if (!textContextMenu || !contextMenuRef.current) return;
    const menu = contextMenuRef.current;
    const menuRect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(textContextMenu.left, window.innerWidth - menuRect.width - 8));
    const top = Math.max(8, Math.min(textContextMenu.top, window.innerHeight - menuRect.height - 8));
    let submenuLeft = textContextMenu.submenuLeft;
    let submenuTop = textContextMenu.submenuTop;
    if (textContextMenu.submenu && contextSubmenuRef.current) {
      const submenuRect = contextSubmenuRef.current.getBoundingClientRect();
      const trigger = menu.querySelector<HTMLElement>(`[data-submenu-trigger="${textContextMenu.submenu}"]`);
      const triggerRect = trigger?.getBoundingClientRect();
      const nextMenuRight = left + menuRect.width + 8;
      const roomRight = window.innerWidth - nextMenuRight - 8;
      submenuLeft = roomRight >= submenuRect.width ? nextMenuRight : Math.max(8, left - submenuRect.width - 8);
      const triggerOffsetTop = triggerRect ? triggerRect.top - menuRect.top : 0;
      submenuTop = Math.max(8, Math.min(top + triggerOffsetTop, window.innerHeight - submenuRect.height - 8));
    }
    const nextLeft = Math.round(left);
    const nextTop = Math.round(top);
    const nextSubLeft = submenuLeft === undefined ? undefined : Math.round(submenuLeft);
    const nextSubTop = submenuTop === undefined ? undefined : Math.round(submenuTop);
    if (Math.abs(nextLeft - textContextMenu.left) > 1 || Math.abs(nextTop - textContextMenu.top) > 1 ||
        nextSubLeft !== textContextMenu.submenuLeft || nextSubTop !== textContextMenu.submenuTop) {
      setTextContextMenu((current) => current ? { ...current, left: nextLeft, top: nextTop, submenuLeft: nextSubLeft, submenuTop: nextSubTop } : current);
    }
  }, [textContextMenu]);

  useEffect(() => {
    if (!textContextMenu) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-studio-text-context-menu]')) return;
      setTextContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTextContextMenu(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [textContextMenu]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(reusableTextComponentsKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const valid = Array.isArray(parsed) ? parsed.filter((entry): entry is StoredReusableTextComponent =>
        Boolean(entry && typeof entry === 'object' &&
          typeof entry.id === 'string' && typeof entry.name === 'string' &&
          (entry.type === 'text' || entry.type === 'heading') && typeof entry.text === 'string' &&
          entry.style && typeof entry.style === 'object'),
      ).slice(0, 50) : [];
      setReusableTextComponents(valid);
    } catch {
      setReusableTextComponents([]);
    }
  }, [reusableTextComponentsKey]);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? (window.visualViewport as VisualViewport | null) : null;
    if (!vv) return;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (window.innerWidth > 699) return;
      window.setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
  const activePage = pages[activePageIndex] ?? pages[0];
  const pageDims = CONTENT_PAGE_SIZES[(activePage?.size ?? 'a4') as keyof typeof CONTENT_PAGE_SIZES] ?? CONTENT_PAGE_SIZES.a4;

  // Give Studio a stable viewport-sized workspace on desktop. Panel contents
  // scroll inside their own panes; they must never push the footer off-screen.
  useEffect(() => {
    const updateHeight = () => {
      if (window.innerWidth <= 1100) {
        setStudioHeight(null);
        return;
      }
      const root = studioRootRef.current;
      if (!root) return;
      const top = Math.max(8, root.getBoundingClientRect().top);
      const next = Math.max(420, Math.floor(window.innerHeight - top - 8));
      setStudioHeight((current) => current === next ? current : next);
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    window.addEventListener('scroll', updateHeight, true);
    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('scroll', updateHeight, true);
    };
  }, []);

  useEffect(() => {
    // Never expose internal/API asset paths as editable text by default.
    setBackgroundImageUrl('');
    setShowBackgroundImageUrlInput(false);
    setBackgroundPreviewOpen(false);
  }, [activePage?.id, activePage?.backgroundImage?.src]);
  const serialized = useMemo(
    () => serializeContentDocument({ kind: 'uptrendify-doc', version: 1, ...(freeMode ? { mode: 'free' as const } : {}), pages } satisfies ContentDocument),
    [pages, freeMode],
  );
  const dirty = serialized !== loadedSnapshot;

  // Restore an unsaved draft only when its saved-version baseline still matches.
  // If the server version has changed, keep the old draft available for an explicit
  // recovery action instead of silently overwriting either copy.
  useEffect(() => {
    const baseline = serializeContentDocument(initialDoc);
    let candidate: LocalStudioDraft | null = null;
    try {
      const raw = window.localStorage.getItem(localDraftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LocalStudioDraft>;
        if (
          parsed.schemaVersion === 1 &&
          typeof parsed.body === 'string' &&
          typeof parsed.baseSnapshot === 'string' &&
          (typeof parsed.baseVersionId === 'string' || parsed.baseVersionId === null) &&
          typeof parsed.activePageIndex === 'number' &&
          typeof parsed.savedAt === 'number'
        ) {
          candidate = parsed as LocalStudioDraft;
        } else {
          window.localStorage.removeItem(localDraftKey);
        }
      }
    } catch {
      // Storage can be disabled or full; the editor remains usable without it.
    }

    if (candidate) {
      if (candidate.body === baseline) {
        try { window.localStorage.removeItem(localDraftKey); } catch { /* storage optional */ }
      } else {
        const recovered = parseContentBody(candidate.body);
        if (recovered && candidate.baseSnapshot === baseline) {
          setPages(recovered.pages.map((page) => layoutPageForFreeCanvas(page)));
          setFreeMode(true);
          setActivePageIndex(Math.max(0, Math.min(candidate.activePageIndex, recovered.pages.length - 1)));
          setSelectedId(null);
          setLoadedSnapshot(baseline);
          setHistory([candidate.body]);
          setHistoryIndex(0);
          setSaved(false);
          setNotice('Recovered unsaved work from this browser. Keep editing or save it as a new version.');
        } else {
          setDraftRecoveryCandidate(candidate);
        }
      }
    }
    setLocalDraftReady(true);
  }, [localDraftKey, initialDoc, currentVersionId]);

  // Write immediately after document edits; localStorage survives browser close,
  // a dev-server Ctrl+C, and a device restart on this same browser/profile.
  useEffect(() => {
    if (!localDraftReady || draftRecoveryCandidate) return;
    try {
      if (serialized === loadedSnapshot) {
        window.localStorage.removeItem(localDraftKey);
        setLocalDraftSaved(false);
        return;
      }
      const draft: LocalStudioDraft = {
        schemaVersion: 1,
        body: serialized,
        baseSnapshot: loadedSnapshot,
        baseVersionId: loadedVersionId ?? currentVersionId,
        activePageIndex,
        savedAt: Date.now(),
      };
      window.localStorage.setItem(localDraftKey, JSON.stringify(draft));
      setLocalDraftSaved(true);
    } catch {
      setLocalDraftSaved(false);
    }
  }, [localDraftReady, draftRecoveryCandidate, serialized, loadedSnapshot, loadedVersionId, currentVersionId, activePageIndex, localDraftKey]);

  const persistDraftOnExit = useCallback(() => {
    if (!localDraftReady || draftRecoveryCandidate) return;
    try {
      if (serialized === loadedSnapshot) {
        window.localStorage.removeItem(localDraftKey);
        return;
      }
      const draft: LocalStudioDraft = {
        schemaVersion: 1,
        body: serialized,
        baseSnapshot: loadedSnapshot,
        baseVersionId: loadedVersionId ?? currentVersionId,
        activePageIndex,
        savedAt: Date.now(),
      };
      window.localStorage.setItem(localDraftKey, JSON.stringify(draft));
    } catch {
      // Best-effort last-chance flush; normal autosave already ran after edits.
    }
  }, [localDraftReady, draftRecoveryCandidate, serialized, loadedSnapshot, loadedVersionId, currentVersionId, activePageIndex, localDraftKey]);

  useEffect(() => {
    window.addEventListener('pagehide', persistDraftOnExit);
    return () => window.removeEventListener('pagehide', persistDraftOnExit);
  }, [persistDraftOnExit]);

  const restoreLocalDraft = () => {
    if (!draftRecoveryCandidate) return;
    if (!window.confirm('This draft was made from a different saved version. Restore it onto the current canvas?')) return;
    const recovered = parseContentBody(draftRecoveryCandidate.body);
    if (!recovered) {
      setError('The saved browser draft could not be parsed. Your current canvas has not been changed.');
      return;
    }
    setPages(recovered.pages.map((page) => layoutPageForFreeCanvas(page)));
    setFreeMode(true);
    setActivePageIndex(Math.max(0, Math.min(draftRecoveryCandidate.activePageIndex, recovered.pages.length - 1)));
    setSelectedId(null);
    setLoadedSnapshot(serializeContentDocument(initialDoc));
    setHistory([draftRecoveryCandidate.body]);
    setHistoryIndex(0);
    setDraftRecoveryCandidate(null);
    setSaved(false);
    setNotice('Recovered the older browser draft. Review it and save as a new version when ready.');
  };

  const persistInlineTextDraft = useCallback((id: string, value: string, richText?: InlineTextRun[]) => {
    if (!localDraftReady) return;
    try {
      const nextPages = pages.map((page, index) => index === activePageIndex
        ? { ...page, blocks: page.blocks.map((block) => block.id === id
            ? ({ ...block, text: value, ...(richText !== undefined ? { richText } : {}), link: undefined } as EditorBlock)
            : block) }
        : page);
      const body = serializeContentDocument({
        kind: 'uptrendify-doc',
        version: 1,
        ...(freeMode ? { mode: 'free' as const } : {}),
        pages: nextPages,
      } satisfies ContentDocument);
      if (body === loadedSnapshot) {
        window.localStorage.removeItem(localDraftKey);
        setLocalDraftSaved(false);
        return;
      }
      const draft: LocalStudioDraft = {
        schemaVersion: 1,
        body,
        baseSnapshot: loadedSnapshot,
        baseVersionId: loadedVersionId ?? currentVersionId,
        activePageIndex,
        savedAt: Date.now(),
      };
      window.localStorage.setItem(localDraftKey, JSON.stringify(draft));
      setLocalDraftSaved(true);
    } catch {
      setLocalDraftSaved(false);
    }
  }, [localDraftReady, pages, activePageIndex, freeMode, loadedSnapshot, loadedVersionId, currentVersionId, localDraftKey]);

  const brandIssues = useMemo(
    () => lintBlocks(activePage?.blocks ?? [], { colors: brand.colors }, activePage?.bg),
    [activePage, brand.colors],
  );
  const health = healthScore(brandIssues, activePage?.blocks.length ?? 0);
  const linkedValues = useMemo(() => ({ title: documentTitle, cta: itemCta ?? undefined }), [documentTitle, itemCta]);
  const charLimit = channelLimit(channel);
  const selected = activePage?.blocks.find((block) => block.id === selectedId) ?? null;
  const contextMenuBlock = textContextMenu ? pages[activePageIndex]?.blocks.find((block) => block.id === textContextMenu.blockId) ?? null : null;
  const selectedGeometry = selected?.geometry ?? { x: 24, y: 24, w: 320, h: 90 };
  const selectedIndex = activePage?.blocks.findIndex((block) => block.id === selectedId) ?? -1;

  const commit = useCallback((nextPages: ContentDocPage[], mode: 'flow' | 'free' = freeMode ? 'free' : 'flow') => {
    setPages(nextPages);
    const snapshot = serializeContentDocument({ kind: 'uptrendify-doc', version: 1, ...(mode === 'free' ? { mode: 'free' as const } : {}), pages: nextPages } satisfies ContentDocument);
    setHistory((current) => {
      const truncated = current.slice(0, historyIndex + 1);
      if (truncated[truncated.length - 1] === snapshot) return truncated;
      const appended = [...truncated, snapshot];
      setHistoryIndex(appended.length - 1);
      return appended.length > HISTORY_LIMIT ? appended.slice(appended.length - HISTORY_LIMIT) : appended;
    });
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyIndex, freeMode]);

  const patchPage = (pageIndex: number, transformer: (blocks: EditorBlock[]) => EditorBlock[]) => {
    commit(pages.map((page, index) => (index === pageIndex ? { ...page, blocks: transformer(page.blocks) } : page)));
  };
  const patchBlock = (id: string, patch: Partial<EditorBlock>) => {
    patchPage(activePageIndex, (current) => current.map((block) => (block.id === id ? ({ ...block, ...patch } as EditorBlock) : block)));
  };
  const patchBlockRef = useRef(patchBlock);
  patchBlockRef.current = patchBlock;

  // Start moving only after the pointer crosses a drag threshold. That preserves
  // ordinary click/double-click text editing while letting the whole element move.
  useEffect(() => {
    const findBlockElement = (id: string) => {
      const nodes = frameRef.current?.querySelectorAll<HTMLElement>('[data-bid]');
      if (!nodes) return null;
      for (const node of Array.from(nodes)) if (node.dataset.bid === id) return node;
      return null;
    };
    const handlePointerMove = (event: PointerEvent) => {
      const drag = freeDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const screenX = event.clientX - drag.startX;
      const screenY = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(screenX, screenY) < 6) return;
      drag.moved = true;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      const nextX = clampCanvasCoordinate(drag.origin.x + screenX / drag.scale);
      const nextY = clampCanvasCoordinate(drag.origin.y + screenY / drag.scale);
      const element = findBlockElement(drag.id);
      if (element) {
        element.style.left = `${nextX}px`;
        element.style.top = `${nextY}px`;
      }
    };
    const handlePointerUp = (event: PointerEvent) => {
      const drag = freeDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      freeDrag.current = null;
      if (!drag.moved) {
        setSelectedId(drag.id);
        return;
      }
      const dx = (event.clientX - drag.startX) / drag.scale;
      const dy = (event.clientY - drag.startY) / drag.scale;
      patchBlockRef.current(drag.id, {
        geometry: {
          ...drag.origin,
          x: clampCanvasCoordinate(drag.origin.x + dx),
          y: clampCanvasCoordinate(drag.origin.y + dy),
        },
      });
    };
    const handlePointerCancel = (event: PointerEvent) => {
      const drag = freeDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      freeDrag.current = null;
      const element = findBlockElement(drag.id);
      if (element) {
        element.style.left = `${drag.origin.x}px`;
        element.style.top = `${drag.origin.y}px`;
      }
    };
    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
    };
  }, []);


  const geometryForVisiblePlacement = (block: EditorBlock, page: ContentDocPage, fallback?: CanvasGeometry): CanvasGeometry => {
    const dims = CONTENT_PAGE_SIZES[page.size ?? 'a4'];
    const base = fallback ?? defaultGeometryForNewBlock(block, page);
    const stage = stageRef.current;
    if (!stage || stage.clientWidth <= 0 || stage.clientHeight <= 0) {
      return {
        ...base,
        x: Math.max(0, Math.round((dims.width - base.w) / 2)),
        y: Math.max(0, Math.round((dims.height - base.h) / 2)),
      };
    }
    const scale = Math.max(0.2, zoom / 100);
    const currentOffset = offsetRef.current;
    const left = Math.max(0, Math.min(dims.width, (0 - currentOffset.x) / scale));
    const right = Math.max(0, Math.min(dims.width, (stage.clientWidth - currentOffset.x) / scale));
    const top = Math.max(0, Math.min(dims.height, (0 - currentOffset.y) / scale));
    const bottom = Math.max(0, Math.min(dims.height, (stage.clientHeight - currentOffset.y) / scale));
    const centerX = right > left ? (left + right) / 2 : dims.width / 2;
    const centerY = bottom > top ? (top + bottom) / 2 : dims.height / 2;
    const maxX = Math.max(0, dims.width - base.w);
    const maxY = Math.max(0, dims.height - base.h);
    return {
      ...base,
      x: Math.round(Math.max(0, Math.min(maxX, centerX - base.w / 2))),
      y: Math.round(Math.max(0, Math.min(maxY, centerY - base.h / 2))),
    };
  };

  const addBlock = (type: EditorBlock['type'], shapeKind?: ContentShapeKind) => {
    if (type === 'image') {
      setDockTab('insert');
      setNotice('Paste a valid HTTP(S) image URL in the Insert panel to add an image.');
      return;
    }
    const base = emptyBlock(type);
    const currentPage = pages[activePageIndex] ?? activePage;
    if (!currentPage) return;
    const pageForPlacement = freeMode ? layoutPageForFreeCanvas(currentPage) : currentPage;
    const unplaced = (type === 'shape' && shapeKind ? { ...base, shape: shapeKind } : base) as EditorBlock;
    const block = freeMode
      ? ({ ...unplaced, geometry: geometryForVisiblePlacement(unplaced, pageForPlacement) } as EditorBlock)
      : unplaced;
    const existingBlocks = freeMode ? pageForPlacement.blocks : currentPage.blocks;
    const nextPages = pages.map((page, index) => index === activePageIndex
      ? { ...page, blocks: [...existingBlocks, block] }
      : page);
    commit(nextPages, freeMode ? 'free' : 'flow');
    setSelectedId(block.id);
    setInspectorTab('design');
    setPreviewMode(false);
  };
  const setBlockGeometry = (id: string, geometry: NonNullable<EditorBlock['geometry']>) => {
    patchPage(activePageIndex, (current) => current.map((block) => (block.id === id ? ({ ...block, geometry } as EditorBlock) : block)));
  };
  const updateBlockGeometry = (block: EditorBlock, key: 'x' | 'y' | 'w' | 'h', rawValue: number) => {
    const current = block.geometry ?? { x: 24, y: 24, w: 320, h: 90 };
    const min = key === 'w' || key === 'h' ? 24 : -2000;
    const value = Number.isFinite(rawValue) ? Math.round(Math.max(min, Math.min(4000, rawValue))) : current[key];
    setBlockGeometry(block.id, { ...current, [key]: value });
  };
  const setPageBackgroundImage = (image: { src: string; alt: string } | null) => {
    commit(pages.map((page, index) => (index === activePageIndex ? { ...page, backgroundImage: image ?? undefined } : page)));
  };
  const insertImageBlock = (src: string, alt: string): boolean => {
    if (!canEdit || !activePage || activePage.blocks.length >= CONTENT_DOC_MAX_BLOCKS) {
      setError('This page has reached its element limit or is not editable.');
      return false;
    }
    const freePages = pages.map(layoutPageForFreeCanvas);
    const imageBlock = {
      id: newBlockId('image'),
      type: 'image' as const,
      url: src,
      alt,
      align: 'center' as const,
      width: 80,
    } satisfies EditorBlock;
    const block = {
      ...imageBlock,
      geometry: geometryForVisiblePlacement(imageBlock, freePages[activePageIndex] ?? activePage, {
        x: 0,
        y: 0,
        w: Math.round(pageDims.width * 0.7),
        h: Math.round(pageDims.height * 0.32),
      }),
    } satisfies EditorBlock;
    const nextPages = freePages.map((page, index) => index === activePageIndex ? { ...page, blocks: [...page.blocks, block] } : page);
    commit(nextPages, 'free');
    setFreeMode(true);
    setSelectedId(block.id);
    setInspectorTab('design');
    setError(null);
    setNotice('Image added as an independent layer. Drag to move, use any edge/corner handle or enter exact X/Y/width/height values to resize.');
    return true;
  };

  const addImageFromUrl = () => {
    if (!canEdit || (activePage?.blocks.length ?? 0) >= CONTENT_DOC_MAX_BLOCKS) return;
    const src = normalizeHttpImageUrl(imageUrlDraft);
    if (!src) {
      setError('Enter a valid image URL beginning with https:// or http://.');
      return;
    }
    if (insertImageBlock(src, imageAltDraft.trim())) {
      setImageUrlDraft('');
      setImageAltDraft('');
    }
  };

  const addImageFromFile = async (file: File) => {
    if (!canEdit || (activePage?.blocks.length ?? 0) >= CONTENT_DOC_MAX_BLOCKS) {
      setError('This page has reached its element limit or is not editable.');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPG, or WEBP image.');
      return;
    }
    if (file.size <= 0 || file.size > 2 * 1024 * 1024) {
      setError('Images must be 2 MB or smaller.');
      return;
    }
    setIsUploadingImage(true);
    setError(null);
    try {
      const assetId = crypto.randomUUID();
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`/api/brands/${brandId}/content/${contentId}/assets/${assetId}`, { method: 'POST', body: form });
      const payload = await response.json().catch(() => null) as { src?: unknown; error?: unknown } | null;
      if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Image upload failed.');
      const src = normalizeStudioAssetPath(payload?.src);
      if (!src) throw new Error('The server returned an invalid image asset reference.');
      if (insertImageBlock(src, imageAltDraft.trim())) setImageAltDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Image upload failed.');
    } finally {
      setIsUploadingImage(false);
      if (imageFileInputRef.current) imageFileInputRef.current.value = '';
    }
  };

  const uploadTemplateRaster = async (embedded: SvgTemplateImport['embeddedImages'][number], maxBytes = 2 * 1024 * 1024): Promise<string | null> => {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i.exec(embedded.dataUrl);
    if (!match) return null;
    const base64 = match[2]!.replace(/\s/g, '');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    if (bytes.length <= 0 || bytes.length > maxBytes) return null;
    const mime = match[1]!.toLowerCase();
    const extension = mime === 'image/jpeg' ? 'jpg' : mime.slice('image/'.length);
    const file = new File([bytes], 'studio-import.' + extension, { type: mime });
    const assetId = crypto.randomUUID();
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`/api/brands/${brandId}/content/${contentId}/assets/${assetId}`, { method: 'POST', body: form });
    const payload = await response.json().catch(() => null) as { src?: unknown; error?: unknown } | null;
    if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'An embedded image could not be uploaded.');
    return normalizeStudioAssetPath(payload?.src);
  };

  const installImportedPages = (importedPages: ContentDocPage[], message: string) => {
    if (!importedPages.length || importedPages.length > CONTENT_DOC_MAX_PAGES) {
      setError('The imported template must contain between 1 and ' + CONTENT_DOC_MAX_PAGES + ' pages.');
      return;
    }
    const nextPages = importedPages.map(layoutPageForFreeCanvas);
    commit(nextPages, 'free');
    setActivePageIndex(0);
    setSelectedId(null);
    setFreeMode(true);
    setPreviewMode(false);
    setLoadedVersionId(null);
    setSaved(false);
    setZoomManual(false);
    manualZoomRef.current = false;
    setNotice(message);
    setError(null);
  };

  const confirmImportedCanvasReplacement = () => {
    const hasCurrentContent = pages.some((page) => page.blocks.length > 0 || Boolean(page.bg) || Boolean(page.backgroundImage));
    if (!dirty && !hasCurrentContent) return true;
    return window.confirm('Import this template as a new editable canvas? The current canvas will be replaced. You can restore it with Undo (Ctrl+Z). Save a new version first if you need a permanent checkpoint.');
  };

  const importSvgMarkup = async (markup: string) => {
    if (!canEdit || isImportingTemplate) return;
    const imported = importSvgTemplate(markup);
    if (!imported) {
      setError('Could not read this as an SVG template. In Canva, download the design as SVG and try again.');
      return;
    }
    if (!confirmImportedCanvasReplacement()) return;
    setIsImportingTemplate(true);
    setError(null);
    try {
      const failedImageIds = new Set<string>();
      const replacementSources = new Map<string, string>();
      for (const embedded of imported.embeddedImages) {
        try {
          const src = await uploadTemplateRaster(embedded);
          if (src) replacementSources.set(embedded.blockId, src);
          else failedImageIds.add(embedded.blockId);
        } catch {
          failedImageIds.add(embedded.blockId);
        }
      }
      const blocks = imported.page.blocks
        .filter((block) => !failedImageIds.has(block.id))
        .map((block) => block.type === 'image' && replacementSources.has(block.id)
          ? ({ ...block, url: replacementSources.get(block.id)! } as EditorBlock)
          : block);
      if (!blocks.length) throw new Error('No supported editable elements could be imported from this SVG.');
      const page = { ...imported.page, blocks };
      const notes = [...imported.warnings];
      if (failedImageIds.size) notes.push(failedImageIds.size + ' embedded image(s) could not be uploaded and were skipped.');
      const warningText = notes.length ? ' Notes: ' + notes.slice(0, 3).join(' ') : '';
      installImportedPages([page], 'Imported SVG template: ' + blocks.length + ' editable layers detected. Review the canvas, then save as a new version.' + warningText);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Template import failed.');
    } finally {
      setIsImportingTemplate(false);
      if (templateFileInputRef.current) templateFileInputRef.current.value = '';
    }
  };

  const importNativeDocument = async (raw: string) => {
    if (!canEdit || isImportingTemplate) return;
    const document = parseContentBody(raw);
    if (!document) {
      setError('This JSON file is not a valid UpTrendifyOS Studio document.');
      return;
    }
    if (!confirmImportedCanvasReplacement()) return;
    installImportedPages(document.pages, 'Imported Studio document with ' + document.pages.length + ' page(s). All supported text, shape and image layers are editable.');
  };

  const importRasterFile = async (file: File) => {
    if (!canEdit || isImportingTemplate || rasterReview) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPG, or WEBP image for AI text recognition.');
      return;
    }
    if (file.size <= 0 || file.size > 2 * 1024 * 1024) {
      setError('AI editable image imports are limited to 2 MB. Canva SVG exports retain more exact editable properties.');
      return;
    }
    if (!confirmImportedCanvasReplacement()) return;
    setIsImportingTemplate(true);
    setError(null);
    try {
      const rawBytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < rawBytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...rawBytes.subarray(offset, Math.min(offset + 0x8000, rawBytes.length)));
      }
      const data = btoa(binary);
      const dataUrl = `data:${file.type};base64,${data}`;
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();

      const response = await fetch(`/api/brands/${brandId}/content/${contentId}/recognize-image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mimeType: file.type, data }),
      });
      const recognition = await response.json().catch(() => null) as {
        components?: Array<Omit<RasterTextCandidate, 'selected'>>;
        notes?: string[];
        error?: string;
      } | null;
      if (!response.ok) throw new Error(recognition?.error || 'AI could not recognize text in this image.');

      const components: RasterTextCandidate[] = (recognition?.components ?? [])
        .filter((component) => component.text.trim() && component.confidence >= 0.3)
        .slice(0, CONTENT_DOC_MAX_BLOCKS)
        .map((component) => {
          const x = Math.max(0, Math.min(999, Math.round(component.bounds.x)));
          const y = Math.max(0, Math.min(999, Math.round(component.bounds.y)));
          return {
            ...component,
            bounds: {
              x,
              y,
              w: Math.max(1, Math.min(1000 - x, Math.round(component.bounds.w))),
              h: Math.max(1, Math.min(1000 - y, Math.round(component.bounds.h))),
            },
            selected: false,
          };
        });

      // Recognition is preview-only until the user reviews and selects boxes.
      // A model guess is never automatically rendered over the original artwork.
      setRasterReview({
        fileName: file.name,
        mimeType: file.type as RasterTextReview['mimeType'],
        dataUrl,
        width,
        height,
        components,
        notes: recognition?.notes ?? [],
      });
      setNotice(components.length
        ? 'Review the detected regions. Only selected text is made editable; unselected content stays in the source image.'
        : 'No readable text was confidently detected. You can still use the original image unchanged.');
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI image recognition failed.');
    } finally {
      setIsImportingTemplate(false);
      if (templateFileInputRef.current) templateFileInputRef.current.value = '';
    }
  };

  const patchRasterCandidate = (index: number, patch: Partial<RasterTextCandidate>) => {
    setRasterReview((current) => current ? ({
      ...current,
      components: current.components.map((component, componentIndex) =>
        componentIndex === index ? { ...component, ...patch } : component),
    }) : current);
  };

  const installRasterImageUnchanged = async () => {
    const review = rasterReview;
    if (!review || isApplyingRasterText) return;
    setIsApplyingRasterText(true);
    setError(null);
    try {
      const sourceUrl = await uploadTemplateRaster({
        blockId: 'raster-original',
        dataUrl: review.dataUrl,
        fileName: review.fileName,
      });
      if (!sourceUrl) throw new Error('The original image could not be stored securely.');
      const ratio = review.width / Math.max(1, review.height);
      const size = (Object.entries(CONTENT_PAGE_SIZES) as Array<[ContentPageSizeId, { width: number; height: number }]>)
        .reduce((best, current) =>
          Math.abs(Math.log(current[1].width / current[1].height / ratio)) <
          Math.abs(Math.log(best[1].width / best[1].height / ratio)) ? current : best,
        )[0];
      installImportedPages([{
        id: newBlockId('page'),
        size,
        bg: '#ffffff',
        backgroundImage: { src: sourceUrl, alt: review.fileName.slice(0, 300), fit: 'contain' },
        blocks: [],
      }], 'Original image imported unchanged. Use SVG/Studio JSON for source-level editable layers, or Grab Text to selectively extract readable text.');
      setRasterReview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import the original image.');
    } finally {
      setIsApplyingRasterText(false);
    }
  };

  const applyRasterTextReview = async () => {
    const review = rasterReview;
    if (!review || isApplyingRasterText) return;
    const selected = review.components.filter((component) => component.selected);
    if (!selected.length) {
      setError('Select at least one detected text region before grabbing it.');
      return;
    }
    setIsApplyingRasterText(true);
    setError(null);
    try {
      const image = new Image();
      image.src = review.dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = review.width;
      canvas.height = review.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('This browser could not prepare the image for text editing.');
      context.drawImage(image, 0, 0);
      const sourcePixels = context.getImageData(0, 0, review.width, review.height);
      const cleaned = eraseRasterTextPixels(
        { width: review.width, height: review.height, data: sourcePixels.data },
        selected.map(({ bounds, color }) => ({ bounds, color })),
      );
      const successful = selected.filter((_, index) => cleaned.regions[index]?.status === 'erased');
      const skipped = selected.filter((_, index) => cleaned.regions[index]?.status !== 'erased');
      if (!successful.length) {
        const unsafe = cleaned.regions.some((region) => region.status === 'unsafe-coverage');
        throw new Error(unsafe
          ? 'No text was changed: a selected box covered too much of the image to erase safely. Adjust the region bounds or leave that text embedded.'
          : 'No text was changed: the estimated text colour did not match enough source pixels. Adjust the region bounds or leave that text embedded.');
      }

      const cleanedPixels = context.createImageData(review.width, review.height);
      cleanedPixels.data.set(cleaned.data);
      context.putImageData(cleanedPixels, 0, 0);
      // PNG is intentional: lossy re-encoding would change pixels outside the
      // selected text regions. Refuse an oversized lossless output instead.
      const cleanedDataUrl = canvas.toDataURL('image/png');
      const bytesInDataUrl = Math.floor((cleanedDataUrl.split(',')[1]?.length ?? 0) * 0.75);
      if (bytesInDataUrl > 4 * 1024 * 1024) {
        throw new Error('The losslessly cleaned image exceeds the 4 MB processing limit. Use a smaller source image or choose "Use image unchanged".');
      }

      const sourceUrl = await uploadTemplateRaster({
        blockId: 'raster-cleaned',
        dataUrl: cleanedDataUrl,
        fileName: review.fileName.replace(/\.[^.]+$/, '') + '-text-cleaned.png',
      }, 4 * 1024 * 1024);
      if (!sourceUrl) throw new Error('The cleaned image could not be stored securely.');

      const ratio = review.width / Math.max(1, review.height);
      const size = (Object.entries(CONTENT_PAGE_SIZES) as Array<[ContentPageSizeId, { width: number; height: number }]>)
        .reduce((best, current) =>
          Math.abs(Math.log(current[1].width / current[1].height / ratio)) <
          Math.abs(Math.log(best[1].width / best[1].height / ratio)) ? current : best,
        )[0];
      const dimensions = CONTENT_PAGE_SIZES[size];
      const imageScale = Math.min(dimensions.width / review.width, dimensions.height / review.height);
      const imageWidth = review.width * imageScale;
      const imageHeight = review.height * imageScale;
      const imageOffsetX = (dimensions.width - imageWidth) / 2;
      const imageOffsetY = (dimensions.height - imageHeight) / 2;

      const blocks: EditorBlock[] = successful.map((component) => {
        const xNorm = Math.max(0, Math.min(1000, component.bounds.x));
        const yNorm = Math.max(0, Math.min(1000, component.bounds.y));
        const wNorm = Math.max(1, Math.min(1000 - xNorm, component.bounds.w));
        const hNorm = Math.max(1, Math.min(1000 - yNorm, component.bounds.h));
        const x = Math.round(imageOffsetX + xNorm * imageWidth / 1000);
        const y = Math.round(imageOffsetY + yNorm * imageHeight / 1000);
        const w = Math.max(24, Math.round(wNorm * imageWidth / 1000));
        const h = Math.max(24, Math.round(hNorm * imageHeight / 1000));
        const fontSize = Math.max(8, Math.min(160, Math.round(component.fontSize * imageHeight / 1000)));
        const fontFamily = (component.fontFamily ?? 'Arial').replace(/[^a-zA-Z0-9 ,'-]/g, '').slice(0, 120) || 'Arial';
        const common = {
          id: newBlockId('text'),
          text: component.text,
          align: component.align,
          color: component.color,
          bg: null,
          bold: component.fontWeight === 'bold',
          italic: component.italic ?? false,
          underline: component.underline ?? false,
          fontSize,
          fontFamily,
          geometry: { x, y, w, h },
          opacity: 1,
        };
        if (fontSize >= 38) {
          return { ...common, type: 'heading', level: (fontSize >= 58 ? 1 : fontSize >= 46 ? 2 : 3) as 1 | 2 | 3 };
        }
        return { ...common, type: 'text', size: fontSize >= 22 ? 'lg' as const : 'md' as const };
      });

      const warning = skipped.length
        ? ` ${skipped.length} selected region(s) stayed embedded because pixel cleanup was not safe; those text layers were not added.`
        : '';
      const textured = successful.some((component) =>
        component.backgroundKind === 'photo' || component.backgroundKind === 'unknown' || component.backgroundKind === 'gradient',
      );
      const textureNote = textured
        ? ' Text over photo/gradient backgrounds can need manual cleanup; inspect before saving.'
        : '';
      installImportedPages([{
        id: newBlockId('page'),
        size,
        bg: '#ffffff',
        backgroundImage: { src: sourceUrl, alt: review.fileName.slice(0, 300), fit: 'contain' },
        blocks,
      }], `Grabbed ${blocks.length} selected text layer(s). Only glyph-like pixels in selected boxes were reconstructed; unselected image content was retained.${warning}${textureNote}`);
      setRasterReview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not safely grab the selected text.');
    } finally {
      setIsApplyingRasterText(false);
    }
  };

  const importTemplateFile = async (file: File) => {
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setError('Template files must be 5 MB or smaller.');
      if (templateFileInputRef.current) templateFileInputRef.current.value = '';
      return;
    }
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.json') || file.type === 'application/json') {
        await importNativeDocument(await file.text());
      } else if (name.endsWith('.svg') || file.type === 'image/svg+xml') {
        await importSvgMarkup(await file.text());
      } else if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(name)) {
        await importRasterFile(file);
      } else {
        setError('This file type is not supported yet. Use Canva SVG for the best editable vector/text import, Studio JSON, or PNG/JPG/WEBP for AI-assisted text reconstruction. PDF, DOCX and PPTX import are not available yet.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Template import failed.');
    } finally {
      if (templateFileInputRef.current) templateFileInputRef.current.value = '';
    }
  };

  const handleTemplatePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    const clipboard = event.clipboardData;
    const raw = clipboard.getData('image/svg+xml') || clipboard.getData('text/html') || clipboard.getData('text/plain');
    if (!raw || !/<svg\b/i.test(raw)) return;
    const match = /<svg\b[\s\S]*?<\/svg\s*>/i.exec(raw);
    if (!match) return;
    event.preventDefault();
    void importSvgMarkup(match[0]);
  };
  const applyBackgroundImageUrl = () => {
    if (!canEdit) return;
    const src = normalizeHttpImageUrl(backgroundImageUrl);
    if (!src) {
      setError('Enter a valid background image URL beginning with https:// or http://.');
      return;
    }
    setPageBackgroundImage({ src, alt: '' });
    setBackgroundImageUrl('');
    setShowBackgroundImageUrlInput(false);
    setError(null);
    setNotice('Page background image updated.');
  };
  const useImageAsBackground = (block: EditorBlock) => {
    if (block.type !== 'image' || !canEditBlock(block)) return;
    commit(pages.map((page, index) => index === activePageIndex
      ? { ...page, backgroundImage: { src: block.url, alt: block.alt }, blocks: page.blocks.filter((entry) => entry.id !== block.id) }
      : page));
    setSelectedId(null);
    setNotice('Image moved to the page background. You can still add new independent image layers.');
  };
  const toggleCanvasMode = () => {
    const nextFreeMode = !freeMode;
    const nextPages = nextFreeMode ? pages.map(layoutPageForFreeCanvas) : pages;
    commit(nextPages, nextFreeMode ? 'free' : 'flow');
    setFreeMode(nextFreeMode);
    setNotice(nextFreeMode
      ? 'Free canvas enabled. Select any element to move and resize it independently.'
      : 'Flow layout enabled. Element geometry is preserved and can be restored by switching back to Free canvas.');
  };
  const insertTemplate = (templateId: string) => {
    const currentHasContent = pages.length > 1 || pages.some((entry) => entry.blocks.length > 0 || Boolean(entry.bg) || Boolean(entry.backgroundImage));
    if ((dirty || currentHasContent) && !window.confirm('Replace the current canvas with this template? The previous canvas will remain available with Undo (Ctrl+Z). Save your current work as a version first if you need a permanent checkpoint.')) return;
    const page = buildTemplatePage(templateId, brand.colors[0] ?? '#7c7cff');
    if (!page) return;
    commit([page], 'free');
    setActivePageIndex(0);
    setSelectedId(null);
    setFreeMode(true);
    setPreviewMode(false);
    setLoadedVersionId(null);
    setNotice('Template inserted as an undoable canvas change. Use Undo to restore the previous design, or edit and save as a new version.');
  };
  const duplicateBlock = (id: string) => {
    const page = pages[activePageIndex];
    if (!page) return;
    const index = page.blocks.findIndex((block) => block.id === id);
    if (index === -1 || page.blocks.length >= CONTENT_DOC_MAX_BLOCKS) return;
    const original = page.blocks[index]!;
    const dims = CONTENT_PAGE_SIZES[page.size ?? 'a4'];
    const originalGeometry = original.geometry ?? geometryForVisiblePlacement(original, page);
    const offsetBy = 24;
    const nextX = originalGeometry.x + offsetBy + originalGeometry.w <= dims.width
      ? originalGeometry.x + offsetBy
      : Math.max(0, originalGeometry.x - offsetBy);
    const nextY = originalGeometry.y + offsetBy + originalGeometry.h <= dims.height
      ? originalGeometry.y + offsetBy
      : Math.max(0, originalGeometry.y - offsetBy);
    const clone = {
      ...original,
      id: newBlockId(original.type),
      ...(freeMode ? { geometry: { ...originalGeometry, x: nextX, y: nextY } } : {}),
    } as EditorBlock;
    patchPage(activePageIndex, (current) => [...current.slice(0, index + 1), clone, ...current.slice(index + 1)]);
    setSelectedId(clone.id);
    setInspectorTab('design');
    setNotice('Duplicated layer selected. It is offset slightly so you can see the copy; drag it into position.');
  };
  const removeBlock = (id: string) => {
    if ((pages[activePageIndex]?.blocks.length ?? 0) <= 1 && pages.length === 1) return;
    patchPage(activePageIndex, (current) => current.filter((block) => block.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const changeLayerOrder = (id: string, destination: 'forward' | 'backward' | 'front' | 'back') => {
    const blocks = pages[activePageIndex]?.blocks ?? [];
    const from = blocks.findIndex((block) => block.id === id);
    if (from < 0 || blocks.length < 2) return;
    const to = destination === 'front'
      ? blocks.length - 1
      : destination === 'back'
        ? 0
        : destination === 'forward'
          ? Math.min(blocks.length - 1, from + 1)
          : Math.max(0, from - 1);
    if (from === to) return;
    patchPage(activePageIndex, (current) => reorderBlocks(current, from, to));
    setSelectedId(id);
  };

  const isEditableTextBlock = (block: EditorBlock | null | undefined): block is Extract<EditorBlock, { type: 'heading' | 'text' }> =>
    Boolean(block && (block.type === 'heading' || block.type === 'text'));

  const copyTextStyle = (blockId: string) => {
    const block = pages[activePageIndex]?.blocks.find((entry) => entry.id === blockId);
    if (!isEditableTextBlock(block)) return;
    setCopiedTextStyle({
      color: block.color, bg: block.bg, bold: block.bold, italic: block.italic,
      underline: block.underline, align: block.align, fontSize: block.fontSize,
      fontFamily: block.fontFamily, opacity: block.opacity,
      ...(block.type === 'text' ? { size: block.size } : { level: block.level }),
    });
    setNotice('Text style copied. Right-click another text block and choose Paste style.');
    setTextContextMenu(null);
  };

  const pasteTextStyle = (blockId: string) => {
    const block = pages[activePageIndex]?.blocks.find((entry) => entry.id === blockId);
    if (!isEditableTextBlock(block) || !copiedTextStyle || !canEditBlock(block)) return;
    const patch: Partial<EditorBlock> & { size?: 'sm' | 'md' | 'lg' | 'xl'; level?: 1 | 2 | 3 } = {
      color: copiedTextStyle.color, bg: copiedTextStyle.bg, bold: copiedTextStyle.bold,
      italic: copiedTextStyle.italic, underline: copiedTextStyle.underline,
      align: copiedTextStyle.align, fontSize: copiedTextStyle.fontSize,
      fontFamily: copiedTextStyle.fontFamily, opacity: copiedTextStyle.opacity,
    };
    if (block.type === 'text') patch.size = copiedTextStyle.size ?? block.size;
    if (block.type === 'heading') patch.level = copiedTextStyle.level ?? block.level;
    patchBlock(blockId, patch);
    setSelectedId(blockId);
    setNotice('Copied text styling applied.');
    setTextContextMenu(null);
  };

  const copyTextFromBlock = async (blockId: string) => {
    const block = pages[activePageIndex]?.blocks.find((entry) => entry.id === blockId);
    if (!isEditableTextBlock(block)) return;
    const text = resolveBlockText(block, linkedValues);
    internalTextClipboardRef.current = text;
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Text copied to the system clipboard.');
    } catch {
      setNotice('Text copied inside Studio. Browser permission prevented system clipboard access.');
    }
    setTextContextMenu(null);
  };

  const pasteTextIntoBlock = async (blockId: string) => {
    const block = pages[activePageIndex]?.blocks.find((entry) => entry.id === blockId);
    if (!isEditableTextBlock(block) || !canEditBlock(block)) return;
    let pasted = '';
    try { pasted = await navigator.clipboard.readText(); } catch { /* use Studio clipboard fallback */ }
    if (!pasted && internalTextClipboardRef.current !== null) pasted = internalTextClipboardRef.current;
    if (pasted === '') {
      setError('No text was available to paste. Copy text in Studio first or allow browser clipboard access.');
      setTextContextMenu(null);
      return;
    }
    patchBlock(blockId, { text: pasted, link: undefined });
    setSelectedId(blockId);
    setNotice('Text pasted into the selected block.');
    setTextContextMenu(null);
  };

  const alignTextToPage = (blockId: string, position: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const page = pages[activePageIndex];
    const block = page?.blocks.find((entry) => entry.id === blockId);
    if (!page || !isEditableTextBlock(block) || !canEditBlock(block) || !freeMode) return;
    const size = CONTENT_PAGE_SIZES[page.size ?? 'a4'];
    const current = block.geometry ?? defaultGeometryForNewBlock(block, page);
    const maxX = Math.max(0, size.width - current.w);
    const maxY = Math.max(0, size.height - current.h);
    const geometry = {
      ...current,
      x: position === 'left' ? 0 : position === 'right' ? maxX : position === 'center' ? Math.round(maxX / 2) : current.x,
      y: position === 'top' ? 0 : position === 'bottom' ? maxY : position === 'middle' ? Math.round(maxY / 2) : current.y,
    };
    patchBlock(blockId, { geometry });
    setSelectedId(blockId);
    setNotice(`Text aligned to page ${position}.`);
    setTextContextMenu(null);
  };

  const editTextLink = (blockId: string) => {
    const block = pages[activePageIndex]?.blocks.find((entry) => entry.id === blockId);
    if (!isEditableTextBlock(block) || !canEditBlock(block)) return;
    const entered = window.prompt('Enter a web link (https:// or http://). Leave empty to remove the link.', block.href ?? '');
    if (entered === null) return;
    if (!entered.trim()) {
      patchBlock(blockId, { href: undefined });
      setNotice('Text link removed.');
      setTextContextMenu(null);
      return;
    }
    const href = normalizeHttpLinkUrl(entered);
    if (!href) {
      setError('Enter a valid HTTP or HTTPS URL.');
      setTextContextMenu(null);
      return;
    }
    patchBlock(blockId, { href });
    setNotice('Web link added to this text block. It opens in a new tab in the document view.');
    setTextContextMenu(null);
  };

  const openTextAssist = (blockId: string, action: TextAssistAction) => {
    const block = pages[activePageIndex]?.blocks.find((entry) => entry.id === blockId);
    if (!isEditableTextBlock(block) || !canEditBlock(block)) return;
    setTextAssist({
      blockId,
      originalText: resolveBlockText(block, linkedValues),
      action,
      tone: 'friendly and clear',
      targetLanguage: 'Hindi',
      result: '',
      loading: false,
      error: null,
    });
    setTextContextMenu(null);
  };

  const runTextAssist = async () => {
    if (!textAssist || textAssist.loading) return;
    const current = textAssist;
    setTextAssist({ ...current, loading: true, error: null, result: '' });
    try {
      const response = await fetch(`/api/brands/${brandId}/content/${contentId}/text-assist`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: current.action,
          text: current.originalText,
          ...(current.action === 'tone' ? { tone: current.tone } : {}),
          ...(current.action === 'translate' ? { targetLanguage: current.targetLanguage } : {}),
        }),
      });
      const payload = await response.json().catch(() => null) as { text?: string; error?: string } | null;
      if (!response.ok || !payload?.text) throw new Error(payload?.error || 'The AI could not transform this text.');
      setTextAssist((latest) => latest && latest.blockId === current.blockId
        ? { ...latest, result: payload.text!, loading: false, error: null }
        : latest);
    } catch (cause) {
      setTextAssist((latest) => latest && latest.blockId === current.blockId
        ? { ...latest, loading: false, error: cause instanceof Error ? cause.message : 'Text assist failed.' }
        : latest);
    }
  };

  const applyTextAssistResult = () => {
    if (!textAssist?.result.trim()) return;
    const block = pages[activePageIndex]?.blocks.find((entry) => entry.id === textAssist.blockId);
    if (!isEditableTextBlock(block) || !canEditBlock(block)) {
      setError('This text block is no longer editable. Reopen text assist on an editable block.');
      setTextAssist(null);
      return;
    }
    patchBlock(block.id, { text: textAssist.result.trim(), link: undefined });
    setSelectedId(block.id);
    setNotice('AI text applied in place. Review it before saving the new version.');
    setTextAssist(null);
  };

  const createReusableTextComponent = (blockId: string) => {
    const block = pages[activePageIndex]?.blocks.find((entry) => entry.id === blockId);
    if (!isEditableTextBlock(block) || !canEditBlock(block)) return;
    const suggested = blockName(block).slice(0, 60);
    const name = window.prompt('Name this reusable text component (saved locally for this brand in this browser).', suggested);
    if (name === null) return;
    const cleanName = name.trim().slice(0, 80);
    if (!cleanName) {
      setError('Enter a name for the reusable component.');
      setTextContextMenu(null);
      return;
    }
    const component: StoredReusableTextComponent = {
      id: crypto.randomUUID(),
      name: cleanName,
      createdAt: Date.now(),
      type: block.type,
      text: resolveBlockText(block, linkedValues),
      style: {
        color: block.color, bg: block.bg, bold: block.bold, italic: block.italic,
        underline: block.underline, align: block.align, fontSize: block.fontSize,
        fontFamily: block.fontFamily, opacity: block.opacity,
        ...(block.type === 'text' ? { size: block.size } : { level: block.level }),
      },
    };
    const next = [component, ...reusableTextComponents.filter((entry) => entry.name.toLowerCase() !== cleanName.toLowerCase())].slice(0, 50);
    setReusableTextComponents(next);
    try {
      window.localStorage.setItem(reusableTextComponentsKey, JSON.stringify(next));
      setNotice(`Reusable component “${cleanName}” saved for this brand in this browser.`);
    } catch {
      setNotice('Component added for this editing session, but browser storage is unavailable so it will not persist after closing Studio.');
    }
    setTextContextMenu(null);
  };

  const insertReusableTextComponent = (component: StoredReusableTextComponent) => {
    const page = pages[activePageIndex];
    if (!page || !canEdit || page.blocks.length >= CONTENT_DOC_MAX_BLOCKS) {
      setError('This page cannot accept another block.');
      setTextContextMenu(null);
      return;
    }
    const common = {
      align: component.style.align ?? 'left',
      color: component.style.color ?? null,
      bg: component.style.bg ?? null,
      bold: component.style.bold ?? false,
      italic: component.style.italic ?? false,
      underline: component.style.underline ?? false,
      ...(component.style.fontSize ? { fontSize: component.style.fontSize } : {}),
      ...(component.style.fontFamily ? { fontFamily: component.style.fontFamily } : {}),
      ...(component.style.opacity !== undefined ? { opacity: component.style.opacity } : {}),
    };
    let block: EditorBlock;
    if (component.type === 'heading') {
      block = { id: newBlockId('heading'), type: 'heading', text: component.text, level: component.style.level ?? 2, ...common };
    } else {
      block = { id: newBlockId('text'), type: 'text', text: component.text, size: component.style.size ?? 'md', ...common };
    }
    if (freeMode) {
      const dims = CONTENT_PAGE_SIZES[page.size ?? 'a4'];
      const source = contextMenuBlock?.geometry ?? defaultGeometryForNewBlock(block, page);
      const base = defaultGeometryForNewBlock(block, page);
      const x = source.x + 24 + base.w <= dims.width ? source.x + 24 : Math.max(0, source.x - 24);
      const y = source.y + 24 + base.h <= dims.height ? source.y + 24 : Math.max(0, source.y - 24);
      block = { ...block, geometry: { ...base, x, y } } as EditorBlock;
    }
    const nextPages = pages.map((entry, index) => index === activePageIndex ? { ...entry, blocks: [...entry.blocks, block] } : entry);
    commit(nextPages, freeMode ? 'free' : 'flow');
    setSelectedId(block.id);
    setInspectorTab('design');
    setNotice(`Inserted reusable component “${component.name}”. It is an independent editable block.`);
    setTextContextMenu(null);
  };

  const requestInlineTextEditing = (blockId: string) => {
    setSelectedId(blockId);
    setInspectorTab('design');
    setInlineTextEditRequest((current) => ({ blockId, sequence: (current?.sequence ?? 0) + 1 }));
    setTextContextMenu(null);
  };

  const openTextContextMenu = (event: React.MouseEvent, block: EditorBlock) => {
    if (previewMode || !canEdit || !isEditableTextBlock(block)) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.editor-inline-edit, [contenteditable="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(block.id);
    setInspectorTab('design');
    setTextContextMenu({ blockId: block.id, left: event.clientX, top: event.clientY, submenu: null });
  };

  // Fit-to-screen: auto until the user zooms manually; refits on panel toggles and resizes.
  const refit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = { w: stage.clientWidth, h: stage.clientHeight };
    const z = Math.max(0.05, fitZoom(rect, { w: pageDims.width, h: pageDims.height }));
    setZoom(Math.round(z * 100));
    setOffset(centerOffset(rect, { w: pageDims.width, h: pageDims.height }, z));
  }, [pageDims.width, pageDims.height]);

  useEffect(() => {
    if (zoomManual) return;
    const initial = window.setTimeout(() => refit(), 60);
    return () => window.clearTimeout(initial);
  }, [zoomManual, pageDims.width, pageDims.height, refit]);

  // Keep the page fitted to the actual canvas viewport while auto-fit is active.
  // Opening/closing the left drawer changes the stage width without changing the page.
  useEffect(() => {
    if (zoomManual) return;
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;

    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        refit();
      });
    });

    observer.observe(stage);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [zoomManual, refit]);

  const zoomCanvas = useCallback((requestedZoom: number, clientPoint?: { x: number; y: number }) => {
    const stage = stageRef.current;
    const nextZoom = Math.max(20, Math.min(300, Math.round(requestedZoom)));
    if (!stage || nextZoom === zoom) {
      if (nextZoom !== zoom) setZoom(nextZoom);
      return;
    }
    const rect = stage.getBoundingClientRect();
    const pointerIsOverStage = stage.matches(':hover');
    const client = clientPoint ?? (pointerIsOverStage ? stagePointerRef.current : {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    const cx = Math.max(0, Math.min(rect.width, client.x - rect.left));
    const cy = Math.max(0, Math.min(rect.height, client.y - rect.top));
    const oldScale = zoom / 100;
    const nextScale = nextZoom / 100;
    const nextOffset = {
      x: cx - (cx - offsetRef.current.x) * (nextScale / oldScale),
      y: cy - (cy - offsetRef.current.y) * (nextScale / oldScale),
    };
    manualZoomRef.current = true;
    setZoomManual(true);
    setZoom(nextZoom);
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  }, [zoom]);

  const setManualZoom = (next: number) => zoomCanvas(next);
  const fitNow = () => {
    manualZoomRef.current = false;
    setZoomManual(false);
    refit();
  };

  // Overflow detection on the active page (frame content taller than the frame).
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) { setOverflow(false); return; }
    const id = window.requestAnimationFrame(() => {
      setOverflow(frame.scrollHeight > frame.clientHeight + 2);
    });
    return () => window.cancelAnimationFrame(id);
  }, [pages, activePageIndex, zoom]);

  /** One-click "Fit text": step every oversized text block down one size until it fits. */
  const fitText = () => {
    patchPage(activePageIndex, (current) => current.map((block) => {
      if (block.type === 'text') return { ...block, size: block.size === 'xl' ? 'lg' : block.size === 'lg' ? 'md' : 'sm' };
      if (block.type === 'heading') return { ...block, level: block.level === 1 ? 2 : 3 };
      return block;
    }));
  };

  const switchVersion = (versionId: string) => {
    if (versionId === loadedVersionId) return;
    if (dirty && !window.confirm('Discard unsaved changes and open that version?')) return;
    const source = versions.find((entry) => entry.id === versionId);
    if (!source) return;
    const parsedDoc = parseContentBody(source.body) ?? createDocumentFromText(source.body);
    const doc = {
      ...parsedDoc,
      mode: 'free' as const,
      pages: parsedDoc.pages.map((page) => layoutPageForFreeCanvas(page)),
    };
    const snapshot = serializeContentDocument(doc);
    setPages(doc.pages);
    setFreeMode(true);
    setActivePageIndex(0);
    setSelectedId(null);
    setLoadedVersionId(versionId);
    loadedBaselineVersionIdRef.current = versionId;
    setLoadedSnapshot(snapshot);
    setDisplayVersion(source.version);
    setHistory([snapshot]);
    setHistoryIndex(0);
    setSaved(false);
    manualZoomRef.current = false;
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
      setLoadedVersionId(null);
      loadedBaselineVersionIdRef.current = null;
      setLoadedSnapshot(serialized);
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

  // Keep the floating toolbar anchored to the selected block's on-screen rect.
  useEffect(() => {
    if (!selectedId || previewMode) { setFloatAnchor(null); return; }
    const compute = () => {
      const el = frameRef.current?.querySelector(`[data-bid="${selectedId}"]`);
      if (!el) { setFloatAnchor(null); return; }
      const r = el.getBoundingClientRect();
      setFloatAnchor({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    compute();
    const id = window.setInterval(compute, 350);
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => { window.clearInterval(id); window.removeEventListener('resize', compute); window.removeEventListener('scroll', compute, true); };
  }, [selectedId, previewMode, pages, activePageIndex, zoom]);

  // Focus mode + shortcuts (skips typing targets).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (event.key === 'Escape' && focusMode) { setFocusMode(false); return; }
      if (event.key === ' ') { spaceHeld.current = true; return; }
      if (typing) return;
      const meta = event.metaKey || event.ctrlKey;
      if (event.key.toLowerCase() === 'f' && !meta) { event.preventDefault(); setFocusMode((value) => !value); return; }
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          setHistoryIndex((index) => {
            if (index >= history.length - 1) return index;
            const target = history[index + 1];
            const doc = parseContentBody(target);
            if (doc) {
              setPages(doc.pages);
              setFreeMode(doc.mode === 'free');
              setActivePageIndex((current) => Math.min(current, doc.pages.length - 1));
              setLoadedVersionId(target === loadedSnapshot ? loadedBaselineVersionIdRef.current : null);
            }
            return index + 1;
          });
        } else {
          setHistoryIndex((index) => {
            if (index <= 0) return index;
            const target = history[index - 1];
            const doc = parseContentBody(target);
            if (doc) {
              setPages(doc.pages);
              setFreeMode(doc.mode === 'free');
              setActivePageIndex((current) => Math.min(current, doc.pages.length - 1));
              setLoadedVersionId(target === loadedSnapshot ? loadedBaselineVersionIdRef.current : null);
            }
            return index - 1;
          });
        }
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        setHistoryIndex((index) => {
          if (index >= history.length - 1) return index;
          const target = history[index + 1];
          const doc = parseContentBody(target);
          if (doc) {
            setPages(doc.pages);
            setFreeMode(doc.mode === 'free');
            setActivePageIndex((current) => Math.min(current, doc.pages.length - 1));
            setLoadedVersionId(target === loadedSnapshot ? loadedBaselineVersionIdRef.current : null);
          }
          return index + 1;
        });
        return;
      }
      if (!selectedId || previewMode) return;
      const selectedBlock = pages[activePageIndex]?.blocks.find((block) => block.id === selectedId);
      if (event.key === 'Enter' && selectedBlock && (selectedBlock.type === 'heading' || selectedBlock.type === 'text')) {
        event.preventDefault();
        requestInlineTextEditing(selectedBlock.id);
        return;
      }
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'c' && selectedBlock && (selectedBlock.type === 'heading' || selectedBlock.type === 'text')) {
        event.preventDefault(); copyTextStyle(selectedBlock.id); return;
      }
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'v' && selectedBlock && (selectedBlock.type === 'heading' || selectedBlock.type === 'text')) {
        event.preventDefault(); pasteTextStyle(selectedBlock.id); return;
      }
      if (meta && event.key.toLowerCase() === 'k' && selectedBlock && (selectedBlock.type === 'heading' || selectedBlock.type === 'text')) {
        event.preventDefault(); editTextLink(selectedBlock.id); return;
      }
      if (meta && !event.altKey && event.key.toLowerCase() === 'c' && selectedBlock && (selectedBlock.type === 'heading' || selectedBlock.type === 'text')) {
        const highlightedText = window.getSelection()?.toString();
        if (!highlightedText) {
          event.preventDefault();
          void copyTextFromBlock(selectedBlock.id);
          return;
        }
      }
      if (meta && !event.altKey && event.key.toLowerCase() === 'v' && selectedBlock && (selectedBlock.type === 'heading' || selectedBlock.type === 'text')) {
        event.preventDefault();
        void pasteTextIntoBlock(selectedBlock.id);
        return;
      }
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'l' && selectedBlock) {
        event.preventDefault();
        patchBlock(selectedBlock.id, { locked: !selectedBlock.locked });
        setNotice(selectedBlock.locked ? 'Text unlocked.' : 'Text locked.');
        return;
      }
      if (meta && ['b', 'i', 'u'].includes(event.key.toLowerCase()) && selectedBlock && (selectedBlock.type === 'text' || selectedBlock.type === 'heading')) {
        event.preventDefault();
        const key = event.key.toLowerCase() as 'b' | 'i' | 'u';
        if (key === 'b') patchBlock(selectedId, { bold: !selectedBlock.bold });
        if (key === 'i') patchBlock(selectedId, { italic: !selectedBlock.italic });
        if (key === 'u') patchBlock(selectedId, { underline: !selectedBlock.underline });
        return;
      }
      if (meta && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateBlock(selectedId); return; }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        removeBlock(selectedId);
        return;
      }
      if (event.key.startsWith('Arrow') && !meta) {
        event.preventDefault();
        const step = event.shiftKey ? 0 : 1; // order nudge; freeform x/y arrives with the scene graph
        void step;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => { if (event.key === ' ') spaceHeld.current = false; };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, previewMode, pages, activePageIndex, history, historyIndex, focusMode, loadedSnapshot]);

  // Canvas zoom is handled by the editor's own controls and wheel listener.
  // Use a non-passive native listener so Ctrl/⌘+wheel cannot zoom the browser page.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        zoomCanvas(zoom + (event.deltaY < 0 ? 10 : -10), { x: event.clientX, y: event.clientY });
        return;
      }
      const horizontal = event.shiftKey ? event.deltaY : event.deltaX;
      const vertical = event.shiftKey ? 0 : event.deltaY;
      const nextOffset = {
        x: offsetRef.current.x - horizontal,
        y: offsetRef.current.y - vertical,
      };
      offsetRef.current = nextOffset;
      setOffset(nextOffset);
      if (frameRef.current) frameRef.current.style.transform = `translate(${nextOffset.x}px, ${nextOffset.y}px) scale(${zoom / 100})`;
      stagePointerRef.current = { x: event.clientX, y: event.clientY };
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoom, zoomCanvas]);

  // Keep keyboard shortcuts inside the canvas where the browser dispatches them.
  // The visible +/- controls and Ctrl/⌘+wheel remain the reliable zoom paths.
  useEffect(() => {
    const onCanvasZoomShortcut = (event: KeyboardEvent) => {
      const stage = stageRef.current;
      if (!stage || !stage.matches(':hover')) return;
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (typing) return;
      const zoomIn = event.key === '+' || event.key === '=' || event.code === 'NumpadAdd';
      const zoomOut = event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract';
      const zoomReset = event.key === '0' || event.code === 'Numpad0';
      if (!zoomIn && !zoomOut && !zoomReset) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (zoomReset) {
        manualZoomRef.current = false;
        setZoomManual(false);
        refit();
        return;
      }
      zoomCanvas(zoom + (zoomIn ? 10 : -10), stagePointerRef.current);
    };
    document.addEventListener('keydown', onCanvasZoomShortcut, true);
    return () => document.removeEventListener('keydown', onCanvasZoomShortcut, true);
  }, [zoom, refit, zoomCanvas]);

  const dockItems = [
    { id: 'layers' as const, label: 'Layers', icon: Layers },
    { id: 'insert' as const, label: 'Insert', icon: Plus },
    { id: 'brand' as const, label: 'Brand', icon: Check },
    { id: 'ai' as const, label: 'AI', icon: Sparkles },
    { id: 'scenes' as const, label: 'Scenes', icon: Layers },
  ];
  const drawerOpen = dockTab !== null && !focusMode;
  const insertTiles = [
    { type: 'heading' as const, label: 'Heading', icon: Heading1 },
    { type: 'text' as const, label: 'Text', icon: Type },
    { type: 'image' as const, label: 'Image', icon: ImageIcon },
    { type: 'button' as const, label: 'CTA', icon: Square },
  ];
  const shapeTiles: Array<{ kind: ContentShapeKind; label: string }> = [
    { kind: 'rectangle', label: 'Rectangle' },
    { kind: 'square', label: 'Square' },
    { kind: 'circle', label: 'Circle' },
    { kind: 'triangle', label: 'Triangle' },
    { kind: 'star', label: 'Star' },
    { kind: 'pyramid', label: 'Pyramid' },
  ];
  const searchNeedle = drawerSearch.trim().toLowerCase();
  const layerMatches = (block: EditorBlock) =>
    !searchNeedle || blockName(block).toLowerCase().includes(searchNeedle) || BLOCK_LABEL[block.type].toLowerCase().includes(searchNeedle);
  const insertMatches = (label: string) => !searchNeedle || label.toLowerCase().includes(searchNeedle);
  const activeBlocks = (activePage?.blocks ?? []).filter(layerMatches);

  const bindInlineToolbar = (blockId: string): InlineTextToolbarChange => (state, apply, prepare) => {
    setInlineSelectionToolbar((current) => state
      ? { blockId, state, apply, prepare }
      : current?.blockId === blockId ? null : current);
  };

  const floatToolbar = (() => {
    if (previewMode) return null;
    const block = selected;
    if (!block || !canEditBlock(block)) return null;

    const inline = inlineSelectionToolbar?.blockId === block.id ? inlineSelectionToolbar : null;
    if (inline && (block.type === 'text' || block.type === 'heading')) {
      const state = inline.state;
      return (
        <div
          className="studio-float"
          data-inline-selection="true"
          role="toolbar"
          aria-label="Selected text formatting"
          style={{ position: 'fixed', left: state.left, top: state.top, width: 'max-content', maxWidth: 'calc(100vw - 16px)' }}
          onMouseDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) event.preventDefault();
            inline.prepare();
          }}
        >
          <span className="st-float-group" aria-label="Selected text emphasis">
            <button type="button" className={state.bold ? 'is-on' : ''} onClick={() => inline.apply('bold')} title="Bold selected text" aria-label="Bold selected text"><strong>B</strong></button>
            <button type="button" className={state.italic ? 'is-on' : ''} onClick={() => inline.apply('italic')} title="Italic selected text" aria-label="Italic selected text"><em>I</em></button>
            <button type="button" className={state.underline ? 'is-on' : ''} onClick={() => inline.apply('underline')} title="Underline selected text" aria-label="Underline selected text"><u>U</u></button>
          </span>
          <span className="st-float-group" aria-label="Selected text colours">
            <input type="color" value={state.color} onChange={(event) => inline.apply('color', event.currentTarget.value)} title="Font colour" aria-label="Selected text font colour" />
            <input type="color" value={state.bg} onChange={(event) => inline.apply('bg', event.currentTarget.value)} title="Text highlight colour" aria-label="Selected text highlight colour" />
          </span>
          <select
            className="st-inline-range-select"
            aria-label="Selected text font family"
            title="Font family"
            value={state.fontFamily}
            onChange={(event) => inline.apply('fontFamily', event.currentTarget.value)}
          >
            {Array.from(new Set([state.fontFamily, 'Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'monospace'])).map((font) => <option key={font} value={font}>{font}</option>)}
          </select>
          <input
            className="st-inline-range-size"
            type="number"
            min={8}
            max={160}
            step={1}
            aria-label="Selected text font size"
            title="Font size"
            value={state.fontSize}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (Number.isFinite(next) && next >= 8 && next <= 160) inline.apply('fontSize', Math.round(next));
            }}
          />
          <button type="button" className="st-inline-range-reset" title="Reset selected text colour" aria-label="Reset selected text colour" onClick={() => inline.apply('color', null)}>A×</button>
          <button type="button" className="st-inline-range-reset" title="Clear selected text highlight" aria-label="Clear selected text highlight" onClick={() => inline.apply('bg', null)}>▧×</button>
        </div>
      );
    }

    if (!floatAnchor) return null;
    return (
      <div className="studio-float" role="toolbar" aria-label="Text formatting" style={{ left: typeof window !== 'undefined' ? Math.max(8, Math.min(floatAnchor.x, window.innerWidth - 420)) : floatAnchor.x, top: Math.max(8, floatAnchor.y - 46), width: 'max-content', maxWidth: 'calc(100vw - 16px)' }}>
        {block.type === 'text' ? (
          <span className="st-float-group" aria-label="Text size">
            {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
              <button key={size} type="button" className={block.size === size ? 'is-on' : ''} onClick={() => patchBlock(block.id, { size })} disabled={!canEditBlock(block)}>{size.toUpperCase()}</button>
            ))}
          </span>
        ) : null}
        {block.type === 'text' || block.type === 'heading' ? (
          <span className="st-float-group" aria-label="Text emphasis">
            <button type="button" className={block.bold ? 'is-on' : ''} onClick={() => patchBlock(block.id, { bold: !block.bold })} disabled={!canEditBlock(block)} title="Bold"><strong>B</strong></button>
            <button type="button" className={block.italic ? 'is-on' : ''} onClick={() => patchBlock(block.id, { italic: !block.italic })} disabled={!canEditBlock(block)} title="Italic"><em>I</em></button>
            <button type="button" className={block.underline ? 'is-on' : ''} onClick={() => patchBlock(block.id, { underline: !block.underline })} disabled={!canEditBlock(block)} title="Underline"><u>U</u></button>
          </span>
        ) : null}
        {block.type === 'shape' ? (
          <span className="st-float-group">
            <input type="color" value={block.color ?? '#8b7cff'} onChange={(event) => patchBlock(block.id, { color: event.target.value })} disabled={!canEditBlock(block)} aria-label="Fill colour" />
          </span>
        ) : null}
        {block.type === 'heading' ? (
          <span className="st-float-group" aria-label="Heading level">
            {([1, 2, 3] as const).map((level) => (
              <button key={level} type="button" className={block.level === level ? 'is-on' : ''} onClick={() => patchBlock(block.id, { level, fontSize: headingFontSizeForLevel(level) })} disabled={!canEditBlock(block)} aria-label={`Set heading level H${level}`} title={`Heading H${level}`}>H{level}</button>
            ))}
          </span>
        ) : null}
        {block.type === 'text' || block.type === 'heading' ? (
          <span className="st-float-group" aria-label="Text alignment">
            {(['left', 'center', 'right'] as const).map((option) => (
              <button key={option} type="button" className={block.align === option ? 'is-on' : ''} onClick={() => patchBlock(block.id, { align: option })} disabled={!canEditBlock(block)} title={`Align text ${option}`}>{option === 'left' ? '⇤' : option === 'center' ? '≡' : '⇥'}</button>
            ))}
          </span>
        ) : null}
      </div>
    );
  })();

  function canEditBlock(block: EditorBlock | null): boolean {
    return block !== null && canEdit && !block.locked;
  }

  const renderBlockInner = (block: EditorBlock) => {
    const editable = canEdit && !block.locked;
    const textProps = { onClick: () => { setSelectedId(block.id); setInspectorTab('design'); }, onCommit: (next: string, runs?: InlineTextRun[]) => patchBlock(block.id, { text: next, ...(block.type === 'heading' || block.type === 'text' ? { richText: runs } : {}), link: undefined }) };
    switch (block.type) {
      case 'heading':
        return (
          <div className={`content-doc-heading align-${block.align} editor-level-${block.level}`} style={{ ...(block.color ? { color: block.color } : {}), ...(block.bg ? { background: block.bg } : {}), fontSize: `${block.fontSize ?? headingFontSizeForLevel(block.level)}px`, fontFamily: block.fontFamily || undefined, fontWeight: block.bold ? 800 : undefined, fontStyle: block.italic ? 'italic' : undefined, textDecoration: block.underline ? 'underline' : undefined, width: '100%', height: '100%', overflow: 'hidden', opacity: block.opacity ?? 1 }}>
            <CanvasText value={resolveBlockText(block, linkedValues)} richText={block.richText} baseStyle={{ bold: block.bold, italic: block.italic, underline: block.underline, color: block.color, bg: block.bg, ...(block.fontSize !== undefined ? { fontSize: block.fontSize } : {}), ...(block.fontFamily ? { fontFamily: block.fontFamily } : {}) }} disabled={!editable} multiline={false} onClick={textProps.onClick} onCommit={textProps.onCommit} onDraftInput={(next, runs) => persistInlineTextDraft(block.id, next, runs)} editOnDoubleClick={true} onInlineToolbarChange={bindInlineToolbar(block.id)} editRequest={inlineTextEditRequest?.blockId === block.id ? inlineTextEditRequest.sequence : 0} onEditingEnd={() => setInlineTextEditRequest((current) => current?.blockId === block.id ? null : current)} />
          </div>
        );
      case 'text':
        return (
          <div className={`content-doc-text size-${block.size} align-${block.align}`} style={{ ...(block.color ? { color: block.color } : {}), ...(block.bg ? { background: block.bg, padding: '6px 10px', borderRadius: 8 } : {}), fontSize: block.fontSize ? `${block.fontSize}px` : undefined, fontFamily: block.fontFamily || undefined, fontWeight: block.bold ? 700 : undefined, fontStyle: block.italic ? 'italic' : undefined, textDecoration: block.underline ? 'underline' : undefined, width: '100%', height: '100%', overflow: 'hidden' }}>
            <CanvasText value={resolveBlockText(block, linkedValues)} richText={block.richText} baseStyle={{ bold: block.bold, italic: block.italic, underline: block.underline, color: block.color, bg: block.bg, ...(block.fontSize !== undefined ? { fontSize: block.fontSize } : {}), ...(block.fontFamily ? { fontFamily: block.fontFamily } : {}) }} disabled={!editable} multiline onClick={textProps.onClick} onCommit={textProps.onCommit} onDraftInput={(next, runs) => persistInlineTextDraft(block.id, next, runs)} editOnDoubleClick={true} onInlineToolbarChange={bindInlineToolbar(block.id)} editRequest={inlineTextEditRequest?.blockId === block.id ? inlineTextEditRequest.sequence : 0} onEditingEnd={() => setInlineTextEditRequest((current) => current?.blockId === block.id ? null : current)} />
          </div>
        );
      case 'image':
        return (
          <div style={{ width: '100%', height: '100%', opacity: block.opacity ?? 1 }}>
            {/* Canvas preview; the URL is validated to http(s) by the body schema. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={block.url} alt={block.alt} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, pointerEvents: 'none' }} />
          </div>
        );
      case 'shape':
        if (block.svgPath && block.svgBounds && block.svgMatrix) {
          return (
            <svg
              width="100%"
              height="100%"
              viewBox={"0 0 " + block.svgBounds.w + " " + block.svgBounds.h}
              preserveAspectRatio="none"
              aria-hidden="true"
              style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}
            >
              <path
                d={block.svgPath}
                transform={"translate(" + (-block.svgBounds.x) + " " + (-block.svgBounds.y) + ") matrix(" + block.svgMatrix.a + " " + block.svgMatrix.b + " " + block.svgMatrix.c + " " + block.svgMatrix.d + " " + block.svgMatrix.e + " " + block.svgMatrix.f + ")"}
                fill={block.svgFillNone ? 'none' : (block.color ?? 'var(--st-accent)')}
                stroke={block.svgFillNone ? (block.color ?? block.svgStroke ?? 'none') : (block.svgStroke ?? 'none')}
                strokeWidth={block.svgStrokeWidth ?? 1}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          );
        }
        return (
          <span className={`content-doc-shape-item is-${block.shape}`} style={{ background: block.color ?? 'var(--st-accent)', width: '100%', height: '100%', display: 'inline-block', pointerEvents: 'none' }} />
        );
      case 'button':
        return (
          <span className={`content-doc-cta-button${block.color ? ' is-custom' : ''}`} style={{ ...(block.color ? { background: block.color, borderColor: 'transparent' } : {}), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', pointerEvents: 'none', opacity: block.opacity ?? 1 }}>
            {resolveBlockText(block, linkedValues)}
          </span>
        );
    }
  };

  /** Resize gesture: dir decides which edges move; writes DOM during drag, commits on release. */
  const onFreeResizeMove = (event: React.PointerEvent, id: string, dir: string) => {
    const resize = freeResize.current;
    if (!resize || resize.id !== id) return;
    const dx = (event.clientX - resize.startX) / (zoom / 100);
    const dy = (event.clientY - resize.startY) / (zoom / 100);
    let { x, y, w, h } = resize.origin;
    if (dir.includes('e')) w = clampCanvasSize(resize.origin.w + dx);
    if (dir.includes('s')) h = clampCanvasSize(resize.origin.h + dy);
    if (dir.includes('w')) { w = clampCanvasSize(resize.origin.w - dx); x = resize.origin.x + resize.origin.w - w; }
    if (dir.includes('n')) { h = clampCanvasSize(resize.origin.h - dy); y = resize.origin.y + resize.origin.h - h; }
    const next: CanvasGeometry = { ...resize.origin, x: clampCanvasCoordinate(x), y: clampCanvasCoordinate(y), w: clampCanvasSize(w), h: clampCanvasSize(h) };
    const el = frameRef.current?.querySelector<HTMLElement>(`[data-bid="${id}"]`);
    if (el) {
      el.style.left = `${next.x}px`;
      el.style.top = `${next.y}px`;
      el.style.width = `${next.w}px`;
      el.style.height = `${next.h}px`;
    }
    freeResize.current = { ...resize, next };
  };
  const finishFreeResize = (id: string) => {
    const resize = freeResize.current;
    if (!resize || resize.id !== id) return;
    freeResize.current = null;
    patchBlock(id, { geometry: resize.next });
  };

  return (
    <div
      ref={studioRootRef}
      className={`studio${focusMode ? ' is-focus' : ''}`}
      style={!focusMode && studioHeight !== null ? { height: studioHeight } : undefined}
      onPaste={handleTemplatePaste}
    >
      {/* ---------- top bar ---------- */}
      <div className="studio-topbar">
        <button type="button" className="st-icon" aria-label="Back to content" title="Back to content (Esc closes panels)" onClick={() => router.push(`/brands/${brandId}/content/${contentId}`)}>
          <ArrowLeft size={16} />
        </button>
        <input
          className="studio-title-input"
          value={documentTitle}
          readOnly
          aria-label="Document title (edit the title in the content brief)"
          title="The document title comes from the content brief"
        />
        {versions.length > 1 ? (
          <select
            className="st-select"
            style={{ width: 'auto' }}
            value={loadedVersionId ?? ''}
            onChange={(event) => switchVersion(event.target.value)}
            disabled={busy}
            aria-label="Content version"
          >
            {versions.map((entry) => (
              <option key={entry.id} value={entry.id}>v{entry.version}{entry.id === currentVersionId ? ' · current' : ''}</option>
            ))}
          </select>
        ) : (
          <span className="editor-version">v{displayVersion}</span>
        )}
        <span className={`studio-save-state${dirty ? ' is-dirty' : saved ? ' is-saved' : ''}`} role="status">
          <span className="dot" />
          {dirty ? (localDraftSaved ? 'Recovery saved locally' : 'Unsaved changes') : saved ? 'Saved · just now' : 'All changes saved'}
        </span>
        {draftRecoveryCandidate ? (
          <button type="button" className="st-btn" onClick={restoreLocalDraft} title="Restore a browser draft from another saved version">
            Restore local draft
          </button>
        ) : null}
        <span className="studio-health" title={`Brand health: ${health}% — ${brandIssues.length} issue${brandIssues.length === 1 ? '' : 's'}`} aria-label={`Brand health ${health} percent`}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <circle cx="10" cy="10" r="7" fill="none" stroke="var(--st-line-strong)" strokeWidth="3" />
            <circle cx="10" cy="10" r="7" fill="none" stroke={health > 80 ? 'var(--st-ok)' : health > 50 ? 'var(--st-warn)' : 'var(--st-danger)'} strokeWidth="3" strokeDasharray={`${(health / 100) * 44} 44`} strokeLinecap="round" transform="rotate(-90 10 10)" />
          </svg>
          {health}%
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="st-icon" onClick={() => setHistoryIndex((index) => { if (index <= 0) return index; const target = history[index - 1]; const doc = parseContentBody(target); if (doc) { setPages(doc.pages); setFreeMode(doc.mode === 'free'); setActivePageIndex((current) => Math.min(current, doc.pages.length - 1)); setLoadedVersionId(target === loadedSnapshot ? loadedBaselineVersionIdRef.current : null); } return index - 1; })} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={15} /></button>
        <button type="button" className="st-icon" onClick={() => setHistoryIndex((index) => { if (index >= history.length - 1) return index; const target = history[index + 1]; const doc = parseContentBody(target); if (doc) { setPages(doc.pages); setFreeMode(doc.mode === 'free'); setActivePageIndex((current) => Math.min(current, doc.pages.length - 1)); setLoadedVersionId(target === loadedSnapshot ? loadedBaselineVersionIdRef.current : null); } return index + 1; })} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 size={15} /></button>
        <button type="button" className="st-btn" onClick={() => { setFocusMode(false); setDockTab('insert'); setDrawerSearch(''); setNotice('Import a Canva SVG export or Studio JSON from the Insert panel. Select a text layer to edit it, or double-click text directly on the canvas.'); }} title="Import editable Canva SVG or Studio JSON"><ImageIcon size={13} /> Import template</button>
        <button type="button" className={`st-btn${freeMode ? ' st-btn--primary' : ''}`} onClick={toggleCanvasMode} aria-pressed={freeMode} title="Switch between stacked flow layout and independently movable/resizable canvas layers">Free canvas{freeMode ? ' ✓' : ''}</button>
        <button type="button" className="st-btn" onClick={() => setPreviewMode((value) => !value)} aria-pressed={previewMode}>{previewMode ? 'Exit preview' : 'Preview'}</button>
        <button type="button" className="st-btn" onClick={() => void save()} disabled={busy || !canEdit || !dirty} title={!canEdit ? 'Editing is available in draft, after change requests, or after rejection.' : !dirty ? 'Nothing to save yet — the canvas matches the saved version.' : 'Save these edits as a new version'}>
          {busy ? 'Saving…' : 'Save new version'}
        </button>
        <button type="button" className="st-btn st-btn--primary" onClick={() => void submitForApproval()} disabled={busy || submitting || !canEdit || dirty || loadedVersionId !== currentVersionId} title={dirty ? 'Save your edits first, then submit the exact saved version.' : loadedVersionId !== currentVersionId ? 'An older version is on the canvas. Open the current version (or save it as a new version) before submitting.' : !canEdit ? 'Editing is not available in this status.' : 'Send this exact saved version to the approval queue.'}>
          {submitting ? 'Sending…' : 'Submit for approval'}
        </button>
      </div>

      {/* ---------- body ---------- */}
      <div className={`studio-body${drawerOpen ? ' has-drawer' : ' is-drawer-closed'}`}>
        {!focusMode ? (
          <nav className="studio-dock" aria-label="Editor panels">
            {dockItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`studio-dock-btn${dockTab === id ? ' is-active' : ''}`}
                onClick={() => setDockTab((current) => (current === id ? null : id))}
                aria-pressed={dockTab === id}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
        ) : null}

        {drawerOpen && !focusMode ? (
          <aside className="studio-drawer" aria-label={`${dockTab} panel`}>
            <div className="studio-drawer-head">
              <span className="st-label">{dockTab}</span>
              <button type="button" className="st-icon" style={{ width: 32, height: 32 }} onClick={() => setDockTab(null)} aria-label="Close panel"><Trash2 size={0} /><span aria-hidden="true">×</span></button>
            </div>
            <div className="studio-drawer-search">
              <input value={drawerSearch} onChange={(event) => setDrawerSearch(event.target.value)} placeholder="Search layers, blocks…" aria-label="Search layers and blocks" />
            </div>
            <div className="studio-drawer-body" role="listbox" aria-label="Layers">
              {dockTab === 'layers' ? (
                <>
                  <span className="st-label">Layers · page {activePageIndex + 1}</span>
                  {(activePage?.blocks ?? []).filter(layerMatches).map((block, matchIndex) => {
                    const Icon = TYPE_ICON[block.type];
                    const realIndex = (activePage?.blocks ?? []).indexOf(block);
                    return (
                      <div
                        key={block.id}
                        className={`st-layer-row${selectedId === block.id ? ' is-selected' : ''}${block.hidden ? ' is-hidden' : ''}`}
                        onClick={() => { setSelectedId(block.id); setInspectorTab('design'); }}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(block.id); } }}
                        draggable={canEdit && !block.locked}
                        onDragStart={(event) => { dragIndex.current = realIndex; event.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => { event.preventDefault(); if (dragIndex.current !== null) { patchPage(activePageIndex, (current) => reorderBlocks(current, dragIndex.current ?? realIndex, realIndex)); dragIndex.current = null; } }}
                        role="button"
                        tabIndex={0}
                      >
                        <GripVertical size={11} style={{ opacity: 0.5 }} aria-hidden="true" />
                        <span style={{ display: 'grid', minWidth: 0 }}>
                          <span className="st-layer-name">{blockName(block)}</span>
                          <span className="st-layer-kind">{BLOCK_LABEL[block.type]}</span>
                        </span>
                        <span className="st-layer-actions">
                          <button type="button" className="st-icon" style={{ width: 32, height: 32 }} aria-label={block.hidden ? 'Show block' : 'Hide block'} title={block.hidden ? 'Show' : 'Hide'} onClick={(event) => { event.stopPropagation(); patchBlock(block.id, { hidden: !block.hidden }); }}>
                            {block.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>

                        </span>
                      </div>
                    );
                  })}
                  {(activePage?.blocks ?? []).length === 0 ? <p className="editor-hint">This page is empty. Use Insert to add blocks.</p> : null}
                  {searchNeedle && activeBlocks.length === 0 ? <p className="editor-hint">No layers match “{drawerSearch}”.</p> : null}
                </>
              ) : null}

              {dockTab === 'insert' ? (
                <>
                  <span className="st-label">Import editable template</span>
                  <label className="st-field">
                    <span>SVG / Studio JSON / PNG-JPG-WEBP · raster AI import max 2 MB</span>
                    <input
                      ref={templateFileInputRef}
                      className="st-input"
                      type="file"
                      accept=".svg,image/svg+xml,.json,application/json,image/png,image/jpeg,image/webp"
                      disabled={!canEdit || isImportingTemplate || isUploadingImage}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) void importTemplateFile(file);
                      }}
                    />
                  </label>
                  <p className="editor-hint">SVG/Studio JSON retain editable layers where the source exposes them. PNG/JPG/WEBP use a review-first Groq Vision workflow: choose the text regions to grab, correct OCR/style/bounds if needed, and only selected text pixels are reconstructed. Font matching and photo/gradient backgrounds may need manual review. PDF/DOCX/PPTX import is not supported yet.</p>
                  {isImportingTemplate ? <p className="editor-hint" role="status">Detecting template layers and importing embedded images…</p> : null}
                  <span className="st-label">Add image</span>
                  <label className="st-field">
                    <span>Upload from device · PNG/JPG/WEBP, max 2 MB</span>
                    <input
                      ref={imageFileInputRef}
                      className="st-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={!canEdit || isUploadingImage || (activePage?.blocks.length ?? 0) >= CONTENT_DOC_MAX_BLOCKS}
                      onChange={(event) => {
                        const input = event.currentTarget;
                        const file = input.files?.[0];
                        input.value = '';
                        if (file) void addImageFromFile(file);
                      }}
                    />
                  </label>
                  {isUploadingImage ? <p className="editor-hint" role="status">Uploading image securely…</p> : null}
                  <span className="st-label">Or use an image URL</span>
                  <label className="st-field">
                    <span>Image URL</span>
                    <input className="st-input" type="url" inputMode="url" value={imageUrlDraft} onChange={(event) => setImageUrlDraft(event.target.value)} placeholder="https://example.com/image.png" disabled={!canEdit} />
                  </label>
                  <label className="st-field">
                    <span>Alt text (optional)</span>
                    <input className="st-input" value={imageAltDraft} onChange={(event) => setImageAltDraft(event.target.value)} placeholder="Describe the image" disabled={!canEdit} />
                  </label>
                  <button type="button" className="st-btn st-btn--primary" onClick={addImageFromUrl} disabled={!canEdit || !imageUrlDraft.trim() || isUploadingImage || (activePage?.blocks.length ?? 0) >= CONTENT_DOC_MAX_BLOCKS}>Insert image on canvas</button>
                  <span className="st-label">Blocks</span>
                  <div className="st-insert-grid">
                    {insertTiles.filter(({ label }) => insertMatches(label)).map(({ type, label, icon: Icon }) => (
                      <button key={type} type="button" className="st-insert-tile" disabled={!canEdit || (activePage?.blocks.length ?? 0) >= CONTENT_DOC_MAX_BLOCKS} onClick={() => addBlock(type)}>
                        <Icon size={16} /> {label}
                      </button>
                    ))}
                  </div>
                  <span className="st-label">Shapes</span>
                  <div className="st-shape-grid">
                    {shapeTiles.filter(({ label }) => insertMatches(label)).map(({ kind, label }) => (
                      <button
                        key={kind}
                        type="button"
                        className="st-shape-tile"
                        aria-label={`Add ${label.toLowerCase()} shape`}
                        disabled={!canEdit || (activePage?.blocks.length ?? 0) >= CONTENT_DOC_MAX_BLOCKS}
                        onClick={() => addBlock('shape', kind)}
                      >
                        <svg className="st-shape-swatch" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          {kind === 'rectangle' ? <rect x="3" y="7" width="18" height="10" rx="2" /> : null}
                          {kind === 'square' ? <rect x="5" y="5" width="14" height="14" rx="2" /> : null}
                          {kind === 'circle' ? <circle cx="12" cy="12" r="8" /> : null}
                          {kind === 'triangle' ? <path d="M12 4l9 16H3z" /> : null}
                          {kind === 'star' ? <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5l-5.4 3 1.2-6L3.3 9.3l6.1-.7z" /> : null}
                          {kind === 'pyramid' ? <path d="M12 3l8 14-8 4-8-4zM12 3v18" /> : null}
                        </svg>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {dockTab === 'brand' ? (
                <>
                  <span className="st-label">Palette</span>
                  <div className="editor-shapes-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
                    {brand.colors.map((color) => (
                      <button key={color} type="button" className="st-shape-tile" style={{ minHeight: 40, height: 40, padding: 4 }} title={`Apply brand colour ${color}`} aria-label={`Apply brand colour ${color}`} disabled={!selected || !canEdit} onClick={() => selected && patchBlock(selected.id, { color })}>
                        <span className="editor-shape-swatch" style={{ background: color, width: 24, height: 24, borderRadius: 6, border: '1px solid var(--st-line-strong)' }} />
                      </button>
                    ))}
                  </div>
                  {brand.fonts.length ? (
                    <>
                      <span className="st-label">Fonts</span>
                      <div className="editor-shapes-row">
                        {brand.fonts.slice(0, 4).map((font) => (
                          <span key={font} className="st-shape-tile" title={`Brand font: ${font}`}>{font}</span>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <span className="st-label">Brand lint {brandIssues.length === 0 ? '· clean' : `· ${brandIssues.length}`}</span>
                  {brandIssues.length === 0 ? <p className="editor-hint">Everything matches the brand kit.</p> : (
                    brandIssues.slice(0, 8).map((issue: BrandLintIssue, index) => (
                      <div key={`${issue.blockId}-${index}`} className="st-layer-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', height: 'auto', padding: '7px 8px' }}>
                        <span style={{ minWidth: 0 }}>
                          <span className="st-layer-name">{issue.kind}</span>
                          <span className="st-layer-summary">{issue.message}</span>
                        </span>
                        <button type="button" className="st-btn" style={{ height: 28, padding: '0 8px' }} onClick={() => patchBlock(issue.blockId, issue.patch)}>Fix</button>
                      </div>
                    ))
                  )}
                </>
              ) : null}
              {dockTab === 'ai' ? (
                <>
                  <span className="st-label">AI</span>
                  <p className="editor-hint">Ask AI to rewrite, shorten or restyle the selected block. <span className="st-preview-tag">Preview</span></p>
                </>
              ) : null}
              {dockTab === 'scenes' ? (
                <>
                  <span className="st-label">Scenes</span>
                  <p className="editor-hint">Storyboard mode for video scripts lands with the content-aware modes. <span className="st-preview-tag">Preview</span></p>
                </>
              ) : null}
            </div>
          </aside>
        ) : null}
        {!drawerOpen && !focusMode ? <div className="studio-drawer-placeholder" aria-hidden="true" /> : null}

        {/* ---------- stage ---------- */}
        <div
          className={`studio-stage${gridOn ? '' : ' no-grid'}`}
          ref={stageRef}
          onPointerEnter={(event) => { stagePointerRef.current = { x: event.clientX, y: event.clientY }; }}
          onPointerDown={(event) => {
            const pan = event.button === 1 || spaceHeld.current || event.target === event.currentTarget;
            if (!pan) return;
            panRef.current = { x: event.clientX, y: event.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            stagePointerRef.current = { x: event.clientX, y: event.clientY };
            const pan = panRef.current;
            if (!pan || !frameRef.current) return;
            const next = { x: pan.ox + (event.clientX - pan.x), y: pan.oy + (event.clientY - pan.y) };
            offsetRef.current = next;
            frameRef.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${zoom / 100})`;
          }}
          onPointerUp={(event) => {
            const pan = panRef.current;
            if (!pan) return;
            const next = { x: pan.ox + (event.clientX - pan.x), y: pan.oy + (event.clientY - pan.y) };
            panRef.current = null;
            setOffset(next);
          }}
        >
          <div
            ref={frameRef}
            className="studio-page-frame"
            style={{
              width: pageDims.width,
              minHeight: pageDims.height,
              backgroundColor: activePage?.bg ?? '#ffffff',
              backgroundImage: activePage?.backgroundImage ? `url(${JSON.stringify(activePage.backgroundImage.src)})` : undefined,
              backgroundSize: activePage?.backgroundImage ? (activePage.backgroundImage.fit ?? 'cover') : undefined,
              backgroundPosition: activePage?.backgroundImage ? 'center' : undefined,
              backgroundRepeat: activePage?.backgroundImage ? 'no-repeat' : undefined,
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom / 100})`,
            }}
            onClick={(event) => { if (event.target === frameRef.current) setSelectedId(null); }}
          >
            <span className="studio-page-label">
              {isStoryboard ? <Clapperboard size={11} /> : null}
              {CONTENT_PAGE_SIZES[activePage?.size ?? 'a4'].label + ' · ' + CONTENT_PAGE_SIZES[activePage?.size ?? 'a4'].width + '×' + CONTENT_PAGE_SIZES[activePage?.size ?? 'a4'].height}
            </span>
            <div
              className="studio-page-clip"
              onClick={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}
            >
            {isStoryboard && activePage?.note ? (
              <span className="studio-director-chip" title="Director's note from the script">
                <Clapperboard size={11} /> {activePage.note}
              </span>
            ) : null}
            {overflow ? (
              <span className="studio-overflow-badge">
                Overflow
                <button type="button" onClick={fitText}>Fit text</button>
              </span>
            ) : null}
            {safeZones ? (
              <div aria-hidden="true" style={{ position: 'absolute', inset: '10% 8%', border: '1px dashed rgba(124,124,255,.55)', borderRadius: 8, pointerEvents: 'none' }} />
            ) : null}
            {freeMode ? (
              (activePage?.blocks ?? []).map((block, layerIndex) => {
                const geo = block.geometry ?? { x: 24, y: 24, w: 320, h: 90 };
                const isSelected = selectedId === block.id && !previewMode;
                return (
                  <div
                    key={block.id}
                    data-bid={block.id}
                    className={`editor-free-block${isSelected ? ' is-selected' : ''}${block.hidden ? ' is-ghost' : ''}`}
                    style={{ left: geo.x, top: geo.y, width: geo.w, height: geo.h, zIndex: layerIndex + 1, transform: geo.rotation ? `rotate(${geo.rotation}deg)` : undefined, cursor: canEdit && !block.locked ? 'move' : 'default' }}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || spaceHeld.current) return;
                      setSelectedId(block.id);
                      const pointerTarget = event.target as HTMLElement;
                      // Text selection inside an active editor must win over element dragging.
                      if (pointerTarget.closest('.editor-inline-edit, [contenteditable="true"]')) return;
                      if (!canEdit || block.locked) return;
                      freeDrag.current = {
                        id: block.id,
                        pointerId: event.pointerId,
                        startX: event.clientX,
                        startY: event.clientY,
                        scale: Math.max(0.2, zoom / 100),
                        moved: false,
                        origin: { ...geo },
                      };
                    }}
                    onContextMenu={(event) => openTextContextMenu(event, block)}

                  >
                    <div className="editor-free-block-content" style={{ opacity: block.opacity ?? 1 }}>
                      {renderBlockInner(block)}
                    </div>
                    {isSelected && canEdit && !block.locked ? (
                      (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const).map((dir) => (
                        <span
                          key={dir}
                          className={`st-free-handle st-handle-${dir}`}
                          style={{ cursor: dir.includes('n') && dir.length === 1 ? 'ns-resize' : dir.includes('s') && dir.length === 1 ? 'ns-resize' : dir === 'e' ? 'ew-resize' : dir === 'w' ? 'ew-resize' : dir === 'ne' ? 'nesw-resize' : dir === 'sw' ? 'nesw-resize' : 'nwse-resize' }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                            freeResize.current = {
                              id: block.id,
                              dir,
                              startX: event.clientX,
                              startY: event.clientY,
                              origin: { ...geo },
                              next: { ...geo },
                            };
                          }}
                          onPointerMove={(event) => onFreeResizeMove(event, block.id, dir)}
                          onPointerUp={() => finishFreeResize(block.id)}
                          onPointerCancel={() => finishFreeResize(block.id)}
                        />
                      ))
                    ) : null}
                  </div>
                );
              })
            ) : (
              (activePage?.blocks ?? []).map((block, index) => {
                const isSelected = selectedId === block.id && !previewMode;
                const dropBefore = dropTarget?.index === index && !dropTarget.below;
                const dropAfter = dropTarget?.index === index && dropTarget.below;
                const textProps = { onClick: () => { setSelectedId(block.id); setInspectorTab('design'); }, onCommit: (next: string, runs?: InlineTextRun[]) => patchBlock(block.id, { text: next, ...(block.type === 'heading' || block.type === 'text' ? { richText: runs } : {}) }) };
                const editable = canEdit && !block.locked;
                return (
                  <div key={block.id} className="editor-drop-wrap">
                    {dropBefore ? <div className="editor-drop-line" /> : null}
                    <div
                      data-bid={block.id}
                      className={`editor-block${isSelected ? ' is-selected' : ''}${block.hidden ? ' is-ghost' : ''}`}
                      onClick={() => setSelectedId(block.id)}
                      data-block-name={`${BLOCK_LABEL[block.type]}: ${blockName(block)}`}
                      onContextMenu={(event) => openTextContextMenu(event, block)}
                      draggable={editable}
                      onDragStart={(event) => { dragIndex.current = index; event.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(event) => { if (dragIndex.current !== null) { event.preventDefault(); setDropTarget({ index, below: event.clientY > (event.currentTarget as HTMLElement).getBoundingClientRect().bottom - 14 }); } }}
                      onDragLeave={() => setDropTarget((current) => (current?.index === index ? null : current))}
                      onDrop={(event) => canvasDrop(index, event)}
                      style={{ cursor: block.locked ? 'not-allowed' : undefined, opacity: block.opacity ?? 1 }}
                    >
                      {block.type === 'heading' ? (
                        <div className={`content-doc-heading align-${block.align} editor-level-${block.level}`} style={{ ...(block.color ? { color: block.color } : {}), ...(block.bg ? { background: block.bg } : {}), fontSize: `${block.fontSize ?? headingFontSizeForLevel(block.level)}px`, fontFamily: block.fontFamily || undefined, fontWeight: block.bold ? 800 : undefined, fontStyle: block.italic ? 'italic' : undefined, textDecoration: block.underline ? 'underline' : undefined }}>
                          <CanvasText value={resolveBlockText(block, linkedValues)} richText={block.richText} baseStyle={{ bold: block.bold, italic: block.italic, underline: block.underline, color: block.color, bg: block.bg, ...(block.fontSize !== undefined ? { fontSize: block.fontSize } : {}), ...(block.fontFamily ? { fontFamily: block.fontFamily } : {}) }} disabled={!editable} multiline={false} onClick={() => setSelectedId(block.id)} onCommit={(next, runs) => patchBlock(block.id, { text: next, richText: runs, link: undefined })} onDraftInput={(next, runs) => persistInlineTextDraft(block.id, next, runs)} editOnDoubleClick={true} onInlineToolbarChange={bindInlineToolbar(block.id)} editRequest={inlineTextEditRequest?.blockId === block.id ? inlineTextEditRequest.sequence : 0} onEditingEnd={() => setInlineTextEditRequest((current) => current?.blockId === block.id ? null : current)} />
                        </div>
                      ) : null}
                      {block.type === 'text' ? (
                        <div className={`content-doc-text size-${block.size} align-${block.align}`} style={{ ...(block.color ? { color: block.color } : {}), ...(block.bg ? { background: block.bg, padding: '6px 10px', borderRadius: 8 } : {}), fontSize: block.fontSize ? `${block.fontSize}px` : undefined, fontFamily: block.fontFamily || undefined, fontWeight: block.bold ? 700 : undefined, fontStyle: block.italic ? 'italic' : undefined, textDecoration: block.underline ? 'underline' : undefined }}>
                          <CanvasText value={resolveBlockText(block, linkedValues)} richText={block.richText} baseStyle={{ bold: block.bold, italic: block.italic, underline: block.underline, color: block.color, bg: block.bg, ...(block.fontSize !== undefined ? { fontSize: block.fontSize } : {}), ...(block.fontFamily ? { fontFamily: block.fontFamily } : {}) }} disabled={!editable} multiline onClick={textProps.onClick} onCommit={(next, runs) => patchBlock(block.id, { text: next, richText: runs, link: undefined })} onDraftInput={(next, runs) => persistInlineTextDraft(block.id, next, runs)} editOnDoubleClick={true} onInlineToolbarChange={bindInlineToolbar(block.id)} editRequest={inlineTextEditRequest?.blockId === block.id ? inlineTextEditRequest.sequence : 0} onEditingEnd={() => setInlineTextEditRequest((current) => current?.blockId === block.id ? null : current)} />
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
                          <span className={`content-doc-shape-item is-${block.shape}`} style={{ background: block.color ?? 'var(--st-accent)', width: `${block.width ?? 60}%`, height: block.height }} />
                        </div>
                      ) : null}
                      {block.type === 'button' ? (
                        <div className={`content-doc-cta align-${block.align}`}>
                          <span className={`content-doc-cta-button${block.color ? ' is-custom' : ''}`} style={block.color ? { background: block.color, borderColor: 'transparent' } : undefined}>
                            {block.text}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  );
                })
            )}
            </div>
          </div>
        </div>

        {/* ---------- inspector ---------- */}
        {!focusMode ? (
          <aside className="studio-inspector" aria-label="Inspector">
            <div className="studio-inspector-tabs" role="tablist" aria-label="Inspector sections">
              {(['design', 'arrange', 'brand', 'ai', 'templates'] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={inspectorTab === tab} className={`studio-inspector-tab${inspectorTab === tab ? ' is-active' : ''}`} onClick={() => setInspectorTab(tab)}>
                  {tab === 'design' ? 'Design' : tab === 'arrange' ? 'Arrange' : tab === 'brand' ? 'Brand' : tab === 'templates' ? 'Templates' : 'AI'}
                </button>
              ))}
            </div>
            <div className="studio-inspector-body">
              {inspectorTab === 'templates' ? (
                <>
                  <span className="st-label">Templates</span>
                  <p className="editor-hint">Choose a starting layout for this canvas. Existing unsaved changes are protected by a confirmation prompt.</p>
                  {STUDIO_TEMPLATES.map((template) => (
                    <button key={template.id} type="button" className="st-insert-tile" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', gap: 8 }} disabled={!canEdit} onClick={() => insertTemplate(template.id)}>
                      <Sparkles size={14} />
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>{template.label}</span>
                      <span className="st-preview-tag">{CONTENT_PAGE_SIZES[template.size].label}</span>
                    </button>
                  ))}
                </>
              ) : !selected ? (
                <>
                  <span className="st-label">Page settings</span>
                  <label className="st-field">
                    <span>Canvas size</span>
                    <select className="st-select" value={activePage?.size ?? 'a4'} disabled={!canEdit || previewMode} onChange={(event) => { const size = event.target.value as ContentPageSizeId; commit(pages.map((page, index) => (index === activePageIndex ? { ...page, size } : page))); }}>
                      {CONTENT_PAGE_SIZE_IDS.map((id) => (
                        <option key={id} value={id}>{CONTENT_PAGE_SIZES[id].label} · {CONTENT_PAGE_SIZES[id].width}×{CONTENT_PAGE_SIZES[id].height}</option>
                      ))}
                    </select>
                  </label>
                  <div className="st-field">
                    <span>Page background</span>
                    <div className="st-field-row">
                      <input type="color" value={activePage?.bg ?? '#ffffff'} disabled={!canEdit || previewMode} onChange={(event) => commit(pages.map((page, index) => (index === activePageIndex ? { ...page, bg: event.target.value } : page)))} aria-label="Page background colour" />
                      <button type="button" className="st-quiet-link" onClick={() => commit(pages.map((page, index) => (index === activePageIndex ? { ...page, bg: undefined } : page)))} disabled={!canEdit || !activePage?.bg}>Reset to white</button>
                    </div>
                  </div>
                  <div className="st-field">
                    <span>Page background image</span>
                    {activePage?.backgroundImage ? (
                      <div className="st-background-image-card">
                        <button type="button" className="st-background-image-preview" onClick={() => setBackgroundPreviewOpen(true)} disabled={previewMode} aria-label="Preview page background image" title="Click to preview the image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={activePage.backgroundImage.src} alt={activePage.backgroundImage.alt || 'Page background preview'} />
                          <span><Eye size={13} /> Preview image</span>
                        </button>
                        <div className="st-field-row">
                          <button type="button" className="st-btn" style={{ height: 30 }} onClick={() => { setBackgroundImageUrl(''); setShowBackgroundImageUrlInput(true); }} disabled={!canEdit || previewMode}>Change image</button>
                          <button type="button" className="st-quiet-link" onClick={() => { setPageBackgroundImage(null); setBackgroundImageUrl(''); setShowBackgroundImageUrlInput(false); }} disabled={!canEdit || previewMode}>Remove image</button>
                        </div>
                      </div>
                    ) : (
                      <p className="editor-hint">No background image. Add an image URL to place an image behind the canvas elements.</p>
                    )}
                    {(!activePage?.backgroundImage || showBackgroundImageUrlInput) ? (
                      <>
                        <input className="st-input" type="url" inputMode="url" value={backgroundImageUrl} onChange={(event) => setBackgroundImageUrl(event.target.value)} placeholder="Paste image URL (HTTP or HTTPS)" disabled={!canEdit || previewMode} />
                        <div className="st-field-row">
                          <button type="button" className="st-btn" style={{ height: 30 }} onClick={applyBackgroundImageUrl} disabled={!canEdit || previewMode || !backgroundImageUrl.trim()}>Apply image</button>
                          {activePage?.backgroundImage ? <button type="button" className="st-quiet-link" onClick={() => { setShowBackgroundImageUrlInput(false); setBackgroundImageUrl(''); }}>Cancel</button> : null}
                        </div>
                      </>
                    ) : null}
                    <span className="editor-hint">The current image opens in a visual preview; internal asset paths are never shown.</span>
                  </div>
                  <div className="st-field">
                    <span>Margins</span>
                    <div className="st-field-row">
                      <input type="range" className="st-range" style={{ ['--p' as string]: '40%' }} defaultValue={40} disabled aria-label="Page margins (preview)" />
                      <span className="st-preview-tag">Preview</span>
                    </div>
                  </div>
                  <div className="st-field">
                    <span>Duplicate page as another format</span>
                    <div className="st-field-row">
                      <select className="st-select" value={duplicateSize} disabled={!canEdit} onChange={(event) => setDuplicateSize(event.target.value as ContentPageSizeId)}>
                        {CONTENT_PAGE_SIZE_IDS.filter((id) => id !== (activePage?.size ?? 'a4')).map((id) => (
                          <option key={id} value={id}>{CONTENT_PAGE_SIZES[id].label}</option>
                        ))}
                      </select>
                      <button type="button" className="st-btn" style={{ height: 32 }} disabled={!canEdit} onClick={() => {
                        const page = pages[activePageIndex];
                        if (!page) return;
                        const copy = reflowPage(page, duplicateSize);
                        commit([...pages, copy]);
                        setActivePageIndex(pages.length);
                        setNotice(`Added ${CONTENT_PAGE_SIZES[duplicateSize].label} copy of page ${activePageIndex + 1}. Text sizes were re-fit for the new canvas.`);
                      }}>Duplicate as format</button>
                    </div>
                  </div>
                  <div className="st-field">
                    <span>Safe zones</span>
                    <div className="st-field-row">
                      <button type="button" className="st-btn" style={{ height: 30 }} onClick={() => setSafeZones((value) => !value)} aria-pressed={safeZones}>{safeZones ? 'Hide guides' : 'Show guides'}</button>
                    </div>
                  </div>
                  <p className="editor-hint">Select a block to edit its text, style, arrangement and brand fit.</p>
                </>
              ) : inspectorTab === 'design' ? (
                <>
                  <span className="st-label">{BLOCK_LABEL[selected.type]} · design</span>
                  <label className="st-field">
                    <span>Opacity · {Math.round((selected.opacity ?? 1) * 100)}%</span>
                    <input
                      className="st-range"
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round((selected.opacity ?? 1) * 100)}
                      onChange={(event) => patchBlock(selected.id, { opacity: Number(event.target.value) / 100 })}
                      disabled={!canEditBlock(selected)}
                      aria-label="Selected element opacity"
                    />
                  </label>
                  {selected.type === 'text' && charLimit ? (
                    <div className="st-field">
                      <span>Channel meter · {channel}</span>
                      <div className="st-field-row">
                        <div className="st-range" style={{ height: 6, borderRadius: 99, background: `linear-gradient(90deg, ${(selected.text || '').length > charLimit ? 'var(--st-danger)' : 'var(--st-ok)'} ${(Math.min((selected.text || '').length, charLimit) / charLimit) * 100}%, var(--st-line-strong) ${(Math.min((selected.text || '').length, charLimit) / charLimit) * 100}%)` }} role="meter" aria-valuenow={(selected.text || '').length} aria-valuemax={charLimit} aria-label="Character count" />
                        <span style={{ fontSize: 11, color: 'var(--st-ink-2)' }}>{(selected.text || '').length}/{charLimit}</span>
                      </div>
                    </div>
                  ) : null}
                  {selected.type === 'text' || selected.type === 'button' ? (
                    <label className="st-field">
                      <span>Linked content field</span>
                      <select className="st-select" value={selected.link ?? ''} disabled={!canEditBlock(selected)} onChange={(event) => patchBlock(selected.id, { link: (event.target.value || undefined) as 'title' | 'cta' | undefined, text: event.target.value === 'title' ? documentTitle : event.target.value === 'cta' ? (itemCta ?? selected.text) : selected.text })}>
                        <option value="">Not linked (custom text)</option>
                        <option value="title">Document title</option>
                        <option value="cta">CTA field</option>
                      </select>
                      {selected.link ? <span style={{ fontSize: 11, color: 'var(--st-ink-3)' }}>Linked blocks follow the content field. Editing the text on canvas detaches the link.</span> : null}
                    </label>
                  ) : null}
                  {selected.type === 'button' ? (
                    <label className="st-field">
                      <span>Button text</span>
                      <input className="st-input" value={selected.text} onChange={(event) => patchBlock(selected.id, { text: event.target.value })} disabled={!canEditBlock(selected)} />
                    </label>
                  ) : null}
                  {selected.type === 'text' || selected.type === 'heading' ? (
                    <div className="st-field st-inline-edit-hint">
                      <span>Text content</span>
                      <p className="editor-hint">Edit on the canvas: double-click the text, or right-click and choose Edit text. No separate textbox is needed.</p>
                    </div>
                  ) : null}
                  {selected.type === 'image' ? (
                    <>
                      <label className="st-field">
                        <span>Image URL</span>
                        <input className="st-input" value={selected.url} onChange={(event) => patchBlock(selected.id, { url: event.target.value })} disabled={!canEditBlock(selected)} inputMode="url" placeholder="https://…" />
                      </label>
                      <label className="st-field">
                        <span>Alt text</span>
                        <input className="st-input" value={selected.alt} onChange={(event) => patchBlock(selected.id, { alt: event.target.value })} disabled={!canEditBlock(selected)} placeholder="Describe the image" />
                      </label>
                      <button type="button" className="st-btn st-btn--primary" onClick={() => useImageAsBackground(selected)} disabled={!canEditBlock(selected)} title="Use this image as the page background instead of a separate layer">Set as page background</button>
                    </>
                  ) : null}
                  {selected.type === 'button' ? (
                    <label className="st-field">
                      <span>Destination URL</span>
                      <input className="st-input" value={selected.href ?? ''} onChange={(event) => patchBlock(selected.id, { href: event.target.value })} disabled={!canEditBlock(selected)} inputMode="url" placeholder="https://destination (optional)" />
                    </label>
                  ) : null}
                  {selected.type === 'heading' || selected.type === 'text' ? (
                    <>
                      <label className="st-field">
                        <span>Font family</span>
                        <select className="st-select" value={selected.fontFamily ?? ''} disabled={!canEditBlock(selected)} onChange={(event) => patchBlock(selected.id, { fontFamily: event.target.value || undefined })}>
                          <option value="">Theme default</option>
                          {Array.from(new Set([...brand.fonts, 'Arial', 'Georgia', 'Inter', 'Roboto', 'Verdana', 'Trebuchet MS'])).map((font) => <option key={font} value={font}>{font}</option>)}
                        </select>
                      </label>
                      <label className="st-field">
                        <span>Font size · px</span>
                        <input className="st-input" type="number" min={8} max={160} step={1} value={selected.fontSize ?? defaultFontSize(selected)} disabled={!canEditBlock(selected)} onChange={(event) => patchBlock(selected.id, { fontSize: Math.max(8, Math.min(160, Math.round(Number(event.target.value) || 8))) })} />
                      </label>
                    </>
                  ) : null}

                  {selected.type === 'text' ? (
                    <div className="st-field">
                      <span>Size</span>
                      <div className="st-field-row">
                        {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                          <button key={size} type="button" className={`st-btn${selected.size === size ? ' st-btn--primary' : ''}`} style={{ height: 32, padding: '0 10px' }} onClick={() => patchBlock(selected.id, { size })} disabled={!canEditBlock(selected)}>{size.toUpperCase()}</button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selected.type === 'shape' ? (
                    selected.svgPath ? (
                      <div className="st-field">
                        <span>Imported vector shape</span>
                        <p className="editor-hint">This source vector stays as its own layer. Resize it on the canvas, change its colour, opacity, and layer order.</p>
                      </div>
                    ) : (
                      <div className="st-field">
                        <span>Shape</span>
                        <select className="st-select" value={selected.shape} disabled={!canEditBlock(selected)} onChange={(event) => patchBlock(selected.id, { shape: event.target.value as ContentShapeKind })}>
                          {CONTENT_SHAPE_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                        </select>
                      </div>
                    )
                  ) : null}
                  {selected.type !== 'image' ? (
                    <div className="st-field">
                      <span>Colour</span>
                      <div className="st-field-row">
                        <input type="color" value={selected.color ?? '#111111'} onChange={(event) => patchBlock(selected.id, { color: event.target.value })} disabled={!canEditBlock(selected)} aria-label="Block colour" />
                        <button type="button" className="st-quiet-link" onClick={() => patchBlock(selected.id, { color: null })} disabled={!canEditBlock(selected) || !selected.color}>Use theme default</button>
                      </div>
                    </div>
                  ) : null}
                  {selected.type === 'heading' || selected.type === 'text' ? (
                    <div className="st-field">
                      <span>Background</span>
                      <div className="st-field-row">
                        <input type="color" value={selected.bg ?? '#ffffff'} onChange={(event) => patchBlock(selected.id, { bg: event.target.value })} disabled={!canEditBlock(selected)} aria-label="Text background colour" />
                        <button
                          type="button"
                          className={`st-btn${selected.bg == null ? ' st-btn--primary' : ''}`}
                          onClick={() => patchBlock(selected.id, { bg: null })}
                          disabled={!canEditBlock(selected)}
                          aria-pressed={selected.bg == null}
                          aria-label="Set text background to transparent"
                          title="Make this text background transparent"
                          style={{ height: 32, padding: '0 9px', display: 'inline-flex', alignItems: 'center', gap: 7 }}
                        >
                          <span aria-hidden="true" style={{
                            width: 16, height: 16, flexShrink: 0, borderRadius: 3,
                            border: '1px solid var(--st-line-strong, #64748b)',
                            backgroundColor: '#ffffff',
                            backgroundImage: 'linear-gradient(45deg, #a1a1aa 25%, transparent 25%, transparent 75%, #a1a1aa 75%), linear-gradient(45deg, #a1a1aa 25%, transparent 25%, transparent 75%, #a1a1aa 75%)',
                            backgroundPosition: '0 0, 4px 4px',
                            backgroundSize: '8px 8px',
                          }} />
                          Transparent
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : inspectorTab === 'arrange' ? (
                <>
                  <span className="st-label">{BLOCK_LABEL[selected.type]} · arrange</span>
                  <div className="st-field st-context-feature-hint">
                    <span>Layer order</span>
                    <div className="st-field-row" style={{ flexWrap: 'wrap', gap: 5 }}>
                      <button type="button" className="st-icon" style={{ width: 30, height: 30 }} onClick={() => changeLayerOrder(selected.id, 'front')} disabled={!canEditBlock(selected) || (activePage?.blocks.length ?? 0) < 2} aria-label="Bring to front" title="Bring to front"><BringToFront size={13} /></button>
                      <button type="button" className="st-icon" style={{ width: 30, height: 30 }} onClick={() => changeLayerOrder(selected.id, 'forward')} disabled={!canEditBlock(selected) || (activePage?.blocks.length ?? 0) < 2} aria-label="Bring forward" title="Bring forward"><ArrowUp size={13} /></button>
                      <button type="button" className="st-icon" style={{ width: 30, height: 30 }} onClick={() => changeLayerOrder(selected.id, 'backward')} disabled={!canEditBlock(selected) || (activePage?.blocks.length ?? 0) < 2} aria-label="Send backward" title="Send backward"><ArrowDown size={13} /></button>
                      <button type="button" className="st-icon" style={{ width: 30, height: 30 }} onClick={() => changeLayerOrder(selected.id, 'back')} disabled={!canEditBlock(selected) || (activePage?.blocks.length ?? 0) < 2} aria-label="Send to back" title="Send to back"><SendToBack size={13} /></button>
                    </div>
                    <span className="editor-hint">Use the right-click Layer submenu for the same actions at the cursor.</span>
                  </div>
                  <div className="st-field">
                    <span>Alignment</span>
                    <div className="st-field-row">
                      {(['left', 'center', 'right'] as const).map((option) => (
                        <button key={option} type="button" className={`st-btn${selected.align === option ? ' st-btn--primary' : ''}`} style={{ height: 32, padding: '0 10px' }} onClick={() => patchBlock(selected.id, { align: option })} disabled={!canEditBlock(selected)}>{option}</button>
                      ))}
                    </div>
                  </div>
                  {freeMode ? (
                    <div className="st-field">
                      <span>Position and size · canvas px</span>
                      {([
                        ['x', 'X'],
                        ['y', 'Y'],
                        ['w', 'Width'],
                        ['h', 'Height'],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="st-field" style={{ marginTop: 6 }}>
                          <span>{label}</span>
                          <input className="st-input" type="number" min={key === 'w' || key === 'h' ? 24 : -2000} max={4000} step={1} value={selectedGeometry[key]} disabled={!canEditBlock(selected) || previewMode} onChange={(event) => updateBlockGeometry(selected, key, Number(event.target.value))} />
                        </label>
                      ))}
                      <span className="editor-hint">Each element has its own X/Y position and width/height. Drag any handle to resize visually, or enter exact dimensions here.</span>
                    </div>
                  ) : null}
                  {!freeMode && (selected.type === 'image' || selected.type === 'button' || selected.type === 'shape') ? (
                    <label className="st-field">
                      <span>Width · {selected.width ?? (selected.type === 'shape' ? 60 : 80)}%</span>
                      <div className="st-field-row">
                        <input type="range" className="st-range" min={20} max={100} step={5} value={selected.width ?? (selected.type === 'shape' ? 60 : 80)} style={{ ['--p' as string]: `${(((selected.width ?? (selected.type === 'shape' ? 60 : 80)) - 20) / 80) * 100}%` }} onChange={(event) => patchBlock(selected.id, { width: Number(event.target.value) })} disabled={!canEditBlock(selected)} />
                        <input className="st-input" style={{ width: 72 }} type="number" min={20} max={100} value={selected.width ?? (selected.type === 'shape' ? 60 : 80)} onChange={(event) => patchBlock(selected.id, { width: Number(event.target.value) })} disabled={!canEditBlock(selected)} aria-label="Width percent" />
                      </div>
                    </label>
                  ) : null}
                  {!freeMode && selected.type === 'shape' ? (
                    <label className="st-field">
                      <span>Height · {selected.height}px</span>
                      <div className="st-field-row">
                        <input type="range" className="st-range" min={24} max={480} step={12} value={selected.height} style={{ ['--p' as string]: `${((selected.height - 24) / 456) * 100}%` }} onChange={(event) => patchBlock(selected.id, { height: Number(event.target.value) })} disabled={!canEditBlock(selected)} />
                        <input className="st-input" style={{ width: 72 }} type="number" min={24} max={480} value={selected.height} onChange={(event) => patchBlock(selected.id, { height: Number(event.target.value) })} disabled={!canEditBlock(selected)} aria-label="Height pixels" />
                      </div>
                    </label>
                  ) : null}
                  <div className="st-field-row" style={{ marginTop: 4 }}>
                    <button type="button" className="st-icon st-danger-icon" style={{ width: 30, height: 30 }} onClick={() => patchBlock(selected.id, { hidden: !selected.hidden })} aria-label={selected.hidden ? 'Show block' : 'Hide block'} title={selected.hidden ? 'Show' : 'Hide'}>{selected.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                    <span className="editor-hint">Duplicate, Delete and Lock are available from the right-click menu.</span>
                  </div>
                </>
              ) : inspectorTab === 'brand' ? (
                <>
                  <span className="st-label">Brand palette</span>
                  <div className="st-field-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {brand.colors.map((color) => (
                      <button key={color} type="button" style={{ width: 30, height: 30, borderRadius: 8, background: color, border: '1px solid var(--st-line-strong)', cursor: 'pointer' }} disabled={!canEditBlock(selected)} onClick={() => selected && patchBlock(selected.id, { color })} aria-label={`Apply ${color}`} title={`Apply ${color}`} />
                    ))}
                  </div>
                  {brand.fonts.length ? (
                    <div className="st-field">
                      <span>Brand fonts</span>
                      <div className="st-field-row" style={{ flexWrap: 'wrap', gap: 4 }}>
                        {brand.fonts.slice(0, 4).map((font) => <span key={font} className="st-preview-tag">{font}</span>)}
                      </div>
                    </div>
                  ) : null}
                  <span className="st-label">Brand lint · {brandIssues.length} issue{brandIssues.length === 1 ? '' : 's'}</span>
                  {brandIssues.slice(0, 6).map((issue: BrandLintIssue, index) => (
                    <div key={`${issue.blockId}-${issue.kind}-${index}`} className="st-layer-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', height: 'auto', padding: '6px 8px' }}>
                      <span style={{ minWidth: 0 }}>
                        <span className="st-layer-name">{issue.kind}</span>
                        <span className="st-layer-summary">{issue.message}</span>
                      </span>
                      <button type="button" className="st-btn" style={{ height: 28, padding: '0 8px' }} onClick={() => patchBlock(issue.blockId, issue.patch)}>Fix</button>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <span className="st-label">AI</span>
                  <p className="editor-hint">Select a block and ask AI to rewrite, shorten or restyle it — grounded in approved Brand Brain facts. <span className="st-preview-tag">Preview</span></p>
                </>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {/* ---------- bottom bar ---------- */}
      {!focusMode ? (
        <div className="studio-bottombar">
          <span className="studio-page-tabs" role="tablist" aria-label="Document pages">
            {pages.map((page, index) => (
              <button key={page.id} type="button" role="tab" aria-selected={index === activePageIndex} className={`studio-page-tab${index === activePageIndex ? ' is-active' : ''}`} onClick={() => { setActivePageIndex(index); setSelectedId(null); }}>
                Page {index + 1}{page.blocks.length ? '' : ' ·'}
              </button>
            ))}
            <button type="button" className="studio-page-tab is-add" onClick={() => { if (pages.length >= CONTENT_DOC_MAX_PAGES) return; const page = newPage(activePage?.size ?? 'a4'); commit([...pages, page]); setActivePageIndex(pages.length); setSelectedId(null); }} disabled={!canEdit || pages.length >= CONTENT_DOC_MAX_PAGES} title="Add a page">
              <Plus size={11} /> Add page
            </button>
            {pages.length > 1 ? (
              <button type="button" className="studio-page-tab is-danger" onClick={() => { if (!window.confirm(`Delete page ${activePageIndex + 1}? Its blocks are removed from the document.`)) return; commit(pages.filter((_, index) => index !== activePageIndex)); setActivePageIndex(0); setSelectedId(null); }} disabled={!canEdit} title="Delete this page">
                <Trash2 size={11} />
              </button>
            ) : null}
          </span>
          <label className="editor-size-picker" title="Canvas size">
            <span className="st-label">Size</span>
            <select className="studio-select" value={activePage?.size ?? 'a4'} disabled={!canEdit || previewMode} onChange={(event) => { const size = event.target.value as ContentPageSizeId; commit(pages.map((page, index) => (index === activePageIndex ? { ...page, size } : page))); }}>
              {CONTENT_PAGE_SIZE_IDS.map((id) => (
                <option key={id} value={id}>{CONTENT_PAGE_SIZES[id].label}</option>
              ))}
            </select>
          </label>
          <span className="editor-zoom">
            <button type="button" className="st-icon" onClick={() => { setManualZoom(zoom - 10); }} aria-label="Zoom out" disabled={zoom <= 20}><Minus size={13} /></button>
            <span style={{ minWidth: 42, textAlign: 'center' }}>{zoom}%</span>
            <button type="button" className="st-icon" onClick={() => { setManualZoom(zoom + 10); }} aria-label="Zoom in" disabled={zoom >= 300}><Plus size={13} /></button>
            <button type="button" className="st-quiet-link" onClick={fitNow} title="Fit the page to the screen">Fit</button>
          </span>
          <span className="spacer" />
          <button type="button" className={`st-btn${gridOn ? ' st-btn--primary' : ''}`} style={{ height: 32, padding: '0 10px' }} onClick={() => setGridOn((value) => !value)} aria-pressed={gridOn}>Grid</button>
          <button type="button" className="st-btn" style={{ height: 32, padding: '0 10px' }} onClick={() => setFocusMode(true)} title="Focus mode (F)">Focus (F)</button>
        </div>
      ) : (
        <button type="button" className="studio-exit-focus" onClick={() => setFocusMode(false)}>Exit focus (F)</button>
      )}

      {floatToolbar}
      {textContextMenu && contextMenuBlock && isEditableTextBlock(contextMenuBlock) ? createPortal(
        <>
        <div ref={contextMenuRef} className="st-context-menu" data-studio-text-context-menu role="menu" aria-label="Text actions"
          onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
          style={{
            position: 'fixed', left: textContextMenu.left, top: textContextMenu.top, zIndex: 100300,
            width: 276, maxWidth: 'calc(100vw - 16px)', maxHeight: 'min(calc(100vh - 16px), 640px)', overflowY: 'auto',
            padding: 8, borderRadius: 14, border: '1px solid var(--line, #e2dbcf)',
            background: 'var(--surface-card, var(--panel, #fffdf8))',
            boxShadow: '0 20px 48px rgba(15, 23, 42, .18)',
            backdropFilter: 'blur(20px)', color: 'var(--text, #292820)', fontSize: 12,
          }}>
          <div className="st-context-menu-heading">
            <span className="st-context-menu-icon"><Type size={15} /></span>
            <span><strong>TEXT ACTIONS</strong><small>{contextMenuBlock.text.trim().slice(0, 34) || 'Selected text'}{contextMenuBlock.text.trim().length > 34 ? '…' : ''}</small></span>
          </div>
          <button className="st-context-item st-context-item--primary" type="button" role="menuitem" disabled={!canEditBlock(contextMenuBlock)} onClick={() => requestInlineTextEditing(contextMenuBlock.id)} style={contextMenuItemStyle}>
            <span>Edit text on canvas</span><span style={contextMenuShortcutStyle}>Enter</span>
          </button>
          <button className="st-context-item" type="button" role="menuitem" onClick={() => void copyTextFromBlock(contextMenuBlock.id)} style={contextMenuItemStyle}>
            <span>Copy</span><span style={contextMenuShortcutStyle}>Ctrl+C</span>
          </button>
          <button className="st-context-item" type="button" role="menuitem" disabled={!canEditBlock(contextMenuBlock)} onClick={() => void pasteTextIntoBlock(contextMenuBlock.id)} style={contextMenuItemStyle}>
            <span>Paste</span><span style={contextMenuShortcutStyle}>Ctrl+V</span>
          </button>
          <div style={contextMenuDividerStyle} />
          <button className="st-context-item" type="button" role="menuitem" onClick={() => copyTextStyle(contextMenuBlock.id)} style={contextMenuItemStyle}>
            <span>Copy style</span><span style={contextMenuShortcutStyle}>Ctrl+Alt+C</span>
          </button>
          <button className="st-context-item" type="button" role="menuitem" disabled={!copiedTextStyle || !canEditBlock(contextMenuBlock)} onClick={() => pasteTextStyle(contextMenuBlock.id)} style={contextMenuItemStyle}>
            <span>Paste style</span><span style={contextMenuShortcutStyle}>Ctrl+Alt+V</span>
          </button>
          <div style={contextMenuDividerStyle} />
          <button className="st-context-item" type="button" role="menuitem" disabled={!canEditBlock(contextMenuBlock) || (activePage?.blocks.length ?? 0) >= CONTENT_DOC_MAX_BLOCKS} onClick={() => { duplicateBlock(contextMenuBlock.id); setTextContextMenu(null); }} style={contextMenuItemStyle}>
            <span>Duplicate</span><span style={contextMenuShortcutStyle}>Ctrl+D</span>
          </button>
          <button className="st-context-item" type="button" role="menuitem" disabled={!canEditBlock(contextMenuBlock) || ((activePage?.blocks.length ?? 0) <= 1 && pages.length === 1)} onClick={() => { removeBlock(contextMenuBlock.id); setTextContextMenu(null); }} style={{ ...contextMenuItemStyle, color: 'var(--text-danger, #b42318)' }}>
            <span>Delete</span><span style={contextMenuShortcutStyle}>Del</span>
          </button>
          {contextMenuBlock.type === 'heading' ? (
            <>
              <div style={contextMenuDividerStyle} />
              <button className="st-context-item" type="button" role="menuitem" data-submenu-trigger="heading" aria-haspopup="menu" aria-expanded={textContextMenu.submenu === 'heading'}
                onClick={() => setTextContextMenu((current) => current ? { ...current, submenu: current.submenu === 'heading' ? null : 'heading', submenuLeft: undefined, submenuTop: undefined } : current)} style={contextMenuItemStyle}>
                <span>Heading level</span><span style={contextMenuShortcutStyle}>H{contextMenuBlock.level} · ›</span>
              </button>

            </>
          ) : null}
          <div style={contextMenuDividerStyle} />
          <button className="st-context-item" type="button" role="menuitem" data-submenu-trigger="layer" aria-haspopup="menu" aria-expanded={textContextMenu.submenu === 'layer'}
            onClick={() => setTextContextMenu((current) => current ? { ...current, submenu: current.submenu === 'layer' ? null : 'layer', submenuLeft: undefined, submenuTop: undefined } : current)} style={contextMenuItemStyle}>
            <span>Layer</span><span style={contextMenuShortcutStyle}>{textContextMenu.submenu === 'layer' ? '⌄' : '›'}</span>
          </button>
          <button className="st-context-item" type="button" role="menuitem" data-submenu-trigger="align" aria-haspopup="menu" aria-expanded={textContextMenu.submenu === 'align'}
            disabled={!freeMode || !canEditBlock(contextMenuBlock)}
            onClick={() => setTextContextMenu((current) => current ? { ...current, submenu: current.submenu === 'align' ? null : 'align', submenuLeft: undefined, submenuTop: undefined } : current)} style={contextMenuItemStyle}>
            <span>Align to page</span><span style={contextMenuShortcutStyle}>{textContextMenu.submenu === 'align' ? '⌄' : '›'}</span>
          </button>
          <div style={contextMenuDividerStyle} />
          <button className="st-context-item" type="button" role="menuitem" onClick={() => { patchBlock(contextMenuBlock.id, { locked: !contextMenuBlock.locked }); setNotice(contextMenuBlock.locked ? 'Text unlocked.' : 'Text locked.'); setTextContextMenu(null); }} style={contextMenuItemStyle}>
            <span>{contextMenuBlock.locked ? 'Unlock' : 'Lock'}</span><span style={contextMenuShortcutStyle}>Alt+Shift+L</span>
          </button>
          <button className="st-context-item" type="button" role="menuitem" disabled={!canEditBlock(contextMenuBlock)} onClick={() => editTextLink(contextMenuBlock.id)} style={contextMenuItemStyle}>
            <span>{contextMenuBlock.href ? 'Edit link…' : 'Link…'}</span><span style={contextMenuShortcutStyle}>Ctrl+K</span>
          </button>
          <div style={contextMenuDividerStyle} />
          <button className="st-context-item st-context-ai-item" type="button" role="menuitem" disabled={!canEditBlock(contextMenuBlock)} onClick={() => openTextAssist(contextMenuBlock.id, 'rewrite')} style={{ ...contextMenuItemStyle, minHeight: 42 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Sparkles size={15} /> Magic Write</span><span style={contextMenuShortcutStyle}>AI</span>
          </button>
          <button className="st-context-item" type="button" role="menuitem" disabled={!canEditBlock(contextMenuBlock)} onClick={() => openTextAssist(contextMenuBlock.id, 'translate')} style={contextMenuItemStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>文A <span>Translate text…</span></span><span style={contextMenuShortcutStyle}>AI</span>
          </button>
          <div style={contextMenuDividerStyle} />
          <button className="st-context-item" type="button" role="menuitem" disabled={!canEditBlock(contextMenuBlock)} onClick={() => createReusableTextComponent(contextMenuBlock.id)} style={contextMenuItemStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Layers size={15} /> Create component…</span><span style={contextMenuShortcutStyle}>Save</span>
          </button>
          <button className="st-context-item" type="button" role="menuitem" data-submenu-trigger="component" aria-haspopup="menu" aria-expanded={textContextMenu.submenu === 'component'} disabled={!reusableTextComponents.length || !canEdit}
            onClick={() => setTextContextMenu((current) => current ? { ...current, submenu: current.submenu === 'component' ? null : 'component', submenuLeft: undefined, submenuTop: undefined } : current)} style={contextMenuItemStyle}>
            <span>Insert reusable component</span><span style={contextMenuShortcutStyle}>{reusableTextComponents.length ? reusableTextComponents.length : 'None'} · ›</span>
          </button>
          <div className="st-context-menu-footnote">
            AI edits are previewed before replacing text. Components are stored locally for this brand in this browser.
          </div>
        </div>
        {textContextMenu.submenu ? (
          <div ref={contextSubmenuRef} className="st-context-menu st-context-submenu" data-studio-text-context-menu role="menu" aria-label="Text action options"
            onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
            style={{
              position: 'fixed', left: textContextMenu.submenuLeft ?? textContextMenu.left + 284,
              top: textContextMenu.submenuTop ?? textContextMenu.top, zIndex: 100301,
              width: 232, maxWidth: 'calc(100vw - 16px)', maxHeight: 'min(calc(100vh - 16px), 480px)', overflowY: 'auto',
              padding: 8, borderRadius: 14, border: '1px solid var(--line, #e2dbcf)',
              background: 'var(--surface-card, var(--panel, #fffdf8))',
              boxShadow: '0 20px 48px rgba(15, 23, 42, .18)', color: 'var(--text, #292820)', fontSize: 12,
            }}>
            <div className="st-context-menu-subtitle">
              {textContextMenu.submenu === 'heading' ? 'HEADING LEVEL' : textContextMenu.submenu === 'layer' ? 'LAYER ORDER' : textContextMenu.submenu === 'align' ? 'ALIGN TO PAGE' : 'REUSABLE COMPONENTS'}
            </div>
            {textContextMenu.submenu === 'heading' && contextMenuBlock.type === 'heading' ? (
              ([1, 2, 3] as const).map((level) => (
                <button className="st-context-item" key={level} type="button" role="menuitem" aria-checked={contextMenuBlock.level === level}
                  onClick={() => { patchBlock(contextMenuBlock.id, { level, fontSize: headingFontSizeForLevel(level) }); setTextContextMenu(null); }}
                  style={{ ...contextMenuItemStyle, fontWeight: contextMenuBlock.level === level ? 800 : 600 }}>
                  <span>H{level}</span><span style={contextMenuShortcutStyle}>{headingFontSizeForLevel(level)} px</span>
                </button>
              ))
            ) : null}
            {textContextMenu.submenu === 'layer' ? (
              ([
                ['Bring to front', 'front'], ['Bring forward', 'forward'],
                ['Send backward', 'backward'], ['Send to back', 'back'],
              ] as const).map(([label, destination]) => (
                <button className="st-context-item" key={destination} type="button" role="menuitem" disabled={!canEditBlock(contextMenuBlock) || (activePage?.blocks.length ?? 0) < 2}
                  onClick={() => { changeLayerOrder(contextMenuBlock.id, destination); setTextContextMenu(null); }} style={contextMenuItemStyle}>{label}</button>
              ))
            ) : null}
            {textContextMenu.submenu === 'align' ? (
              ([
                ['Left', 'left'], ['Center horizontally', 'center'], ['Right', 'right'],
                ['Top', 'top'], ['Middle vertically', 'middle'], ['Bottom', 'bottom'],
              ] as const).map(([label, position]) => (
                <button className="st-context-item" key={position} type="button" role="menuitem" disabled={!freeMode || !canEditBlock(contextMenuBlock)}
                  onClick={() => alignTextToPage(contextMenuBlock.id, position)} style={contextMenuItemStyle}>{label}</button>
              ))
            ) : null}
            {textContextMenu.submenu === 'component' ? (
              reusableTextComponents.map((component) => (
                <button className="st-context-item" key={component.id} type="button" role="menuitem" disabled={!canEdit}
                  onClick={() => insertReusableTextComponent(component)} style={{ ...contextMenuItemStyle, display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 2 }}>
                  <strong style={{ overflowWrap: 'anywhere' }}>{component.name}</strong>
                  <span style={{ color: 'var(--muted, #756f63)', fontSize: 10 }}>{component.type === 'heading' ? 'Heading' : 'Text'} · {component.text.slice(0, 44)}{component.text.length > 44 ? '…' : ''}</span>
                </button>
              ))
            ) : null}
          </div>
        ) : null}
        </>,
        document.body
      ) : null}

      {backgroundPreviewOpen && activePage?.backgroundImage ? createPortal(
        <div className="st-background-preview-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBackgroundPreviewOpen(false); }}>
          <section className="st-background-preview-dialog" role="dialog" aria-modal="true" aria-label="Page background image preview">
            <div className="st-background-preview-head">
              <div><strong>Page background</strong><span>Image preview</span></div>
              <button type="button" className="st-icon" onClick={() => setBackgroundPreviewOpen(false)} aria-label="Close background preview">×</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activePage.backgroundImage.src} alt={activePage.backgroundImage.alt || 'Page background image'} />
          </section>
        </div>,
        document.body
      ) : null}

      {textAssist ? (
        <div className="studio-upload-overlay st-text-assist-overlay" role="presentation" style={{ zIndex: 100250, alignItems: 'center', justifyContent: 'center', padding: 18, overflowY: 'auto' }}>
          <section role="dialog" aria-modal="true" aria-labelledby="text-assist-title" className="studio-upload-dialog st-text-assist-dialog" style={{
            width: 'min(760px, 96vw)', maxWidth: 760, maxHeight: '92vh', overflow: 'auto', gap: 14,
            alignItems: 'stretch', background: 'var(--surface-card, var(--panel, #fffdf8))', color: 'var(--text, #292820)',
            border: '1px solid var(--line, #e2dbcf)', padding: 20, borderRadius: 16,
            boxShadow: '0 24px 72px rgba(15, 23, 42, .18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="st-text-assist-icon"><Sparkles size={20} /></span>
                <div>
                  <strong id="text-assist-title" style={{ fontSize: 19, letterSpacing: '-.02em' }}>{textAssist.action === 'translate' ? 'Translate text' : 'Magic Write'}</strong>
                  <p className="editor-hint" style={{ margin: '5px 0 0' }}>Preview first. The canvas changes only when you choose Replace text.</p>
                </div>
              </div>
              <button type="button" className="st-icon" onClick={() => setTextAssist(null)} disabled={textAssist.loading} aria-label="Close text assist">×</button>
            </div>
            <div className="st-text-assist-source">
              <span>ORIGINAL TEXT</span><p>{textAssist.originalText}</p>
            </div>
            {textAssist.action === 'translate' ? (
              <label className="st-field"><span>Translate into</span>
                <select className="st-select" value={textAssist.targetLanguage} onChange={(event) => setTextAssist({ ...textAssist, targetLanguage: event.target.value, result: '', error: null })} disabled={textAssist.loading}>
                  {['Hindi', 'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Arabic', 'Bengali', 'Gujarati', 'Marathi', 'Tamil', 'Telugu', 'Urdu', 'Indonesian', 'Thai', 'Vietnamese', 'Dutch', 'Russian'].map((language) => <option key={language} value={language}>{language}</option>)}
                </select>
              </label>
            ) : (
              <div className="st-text-assist-controls">
                <label className="st-field"><span>Writing action</span>
                  <select className="st-select" value={textAssist.action} onChange={(event) => setTextAssist({ ...textAssist, action: event.target.value as TextAssistAction, result: '', error: null })} disabled={textAssist.loading}>
                    <option value="rewrite">Rewrite clearly</option><option value="shorten">Shorten</option><option value="expand">Expand</option><option value="tone">Change tone</option>
                  </select>
                </label>
                {textAssist.action === 'tone' ? (
                  <label className="st-field"><span>Tone</span>
                    <select className="st-select" value={textAssist.tone} onChange={(event) => setTextAssist({ ...textAssist, tone: event.target.value, result: '', error: null })} disabled={textAssist.loading}>
                      {['friendly and clear', 'professional', 'bold and confident', 'playful', 'minimal', 'premium and elegant', 'persuasive but factual', 'warm and human'].map((tone) => <option key={tone} value={tone}>{tone}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
            )}
            {textAssist.error ? <div className="st-text-assist-error" role="alert">{textAssist.error}</div> : null}
            {textAssist.result ? (
              <label className="st-field"><span>AI RESULT · REVIEW BEFORE APPLYING</span>
                <textarea className="st-textarea st-text-assist-result" value={textAssist.result} onChange={(event) => setTextAssist({ ...textAssist, result: event.target.value })} rows={5} disabled={textAssist.loading} />
              </label>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="st-btn" onClick={() => setTextAssist(null)} disabled={textAssist.loading}>Cancel</button>
              <button type="button" className="st-btn st-btn--primary st-text-assist-generate" onClick={() => void runTextAssist()} disabled={textAssist.loading || (textAssist.action === 'translate' && !textAssist.targetLanguage.trim())}>
                {textAssist.loading ? <LoaderCircle size={14} className="studio-upload-spinner" /> : <Sparkles size={14} />}
                {textAssist.loading ? 'Working…' : textAssist.result ? 'Regenerate' : 'Generate preview'}
              </button>
              <button type="button" className="st-btn st-btn--primary" onClick={applyTextAssistResult} disabled={!textAssist.result.trim() || textAssist.loading}>Replace text</button>
            </div>
          </section>
        </div>
      ) : null}

      {rasterReview ? (
        <div className="studio-upload-overlay" role="presentation" style={{ zIndex: 100100, alignItems: 'center', justifyContent: 'center', padding: 18, overflowY: 'auto' }}>
          <section role="dialog" aria-modal="true" aria-labelledby="raster-text-review-title" className="studio-upload-dialog" style={{
            width: 'min(1180px, 96vw)', maxWidth: 1180, maxHeight: '94vh', overflow: 'auto', gap: 12,
            alignItems: 'stretch', background: 'var(--surface-card, var(--panel, #fffdf8))', color: 'var(--text, #292820)',
            border: '1px solid var(--line, #e2dbcf)', padding: 18,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong id="raster-text-review-title" style={{ fontSize: 18 }}>Grab text from image</strong>
                <p className="editor-hint" style={{ margin: '6px 0 0' }}>Nothing is changed yet. Select only the text you want to edit; correct the detected wording or region bounds first.</p>
              </div>
              <button type="button" className="st-icon" onClick={() => setRasterReview(null)} disabled={isApplyingRasterText} aria-label="Cancel text recognition">×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  width: '100%', aspectRatio: `${rasterReview.width} / ${rasterReview.height}`,
                  position: 'relative', overflow: 'hidden', background: 'var(--st-surface)',
                  border: '1px solid var(--st-border, #334155)', borderRadius: 8,
                }}>
                  <img src={rasterReview.dataUrl} alt="Original image text-recognition preview" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                  {rasterReview.components.map((component, index) => (
                    <button key={index} type="button"
                      aria-label={`${component.selected ? 'Deselect' : 'Select'} region ${index + 1}: ${component.text}`}
                      aria-pressed={component.selected}
                      onClick={() => patchRasterCandidate(index, { selected: !component.selected })}
                      style={{
                        position: 'absolute',
                        left: `${Math.max(0, Math.min(1000, component.bounds.x)) / 10}%`,
                        top: `${Math.max(0, Math.min(1000, component.bounds.y)) / 10}%`,
                        width: `${Math.max(1, Math.min(1000 - component.bounds.x, component.bounds.w)) / 10}%`,
                        height: `${Math.max(1, Math.min(1000 - component.bounds.y, component.bounds.h)) / 10}%`,
                        minWidth: 16, minHeight: 12, padding: 0, borderRadius: 3,
                        border: component.selected ? '2px solid #22c55e' : '1px solid #38bdf8',
                        background: component.selected ? 'rgba(34,197,94,.12)' : 'rgba(56,189,248,.06)',
                        color: '#fff', fontSize: 10, fontWeight: 700, textShadow: '0 1px 2px #000', cursor: 'pointer',
                      }} title={component.text}>{index + 1}</button>
                  ))}
                </div>
                <div className="editor-hint" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                  <span><span style={{ color: '#38bdf8' }}>□</span> detected</span>
                  <span><span style={{ color: '#22c55e' }}>□</span> selected to grab</span>
                  <span>Click a numbered region to toggle.</span>
                </div>
                {rasterReview.notes.length ? <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: 'var(--st-surface, #0b0f15)', fontSize: 12 }}>
                  <strong>Recognition notes</strong>
                  {rasterReview.notes.slice(0, 4).map((note, index) => <p key={index} style={{ margin: '5px 0 0' }}>{note}</p>)}
                </div> : null}
              </div>
              <div style={{ minWidth: 0, maxHeight: '61vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {rasterReview.components.length ? rasterReview.components.map((component, index) => (
                  <div key={index} style={{
                    border: `1px solid ${component.selected ? '#22c55e' : 'var(--st-border, #334155)'}`,
                    borderRadius: 8, padding: 10,
                    background: component.selected ? 'rgba(34,197,94,.06)' : 'var(--st-surface, #0b0f15)',
                    display: 'flex', flexDirection: 'column', gap: 7,
                  }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={component.selected} onChange={(event) => patchRasterCandidate(index, { selected: event.target.checked })} style={{ marginTop: 3 }} />
                      <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.4 }}>#{index + 1} · {component.text || 'Empty text'}</span>
                      <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11, color: 'var(--st-muted, #9ca3af)' }}>{Math.round(component.confidence * 100)}%</span>
                    </label>
                    <label className="st-field"><span>Text (correct OCR before grabbing)</span>
                      <input className="st-input" value={component.text} onChange={(event) => patchRasterCandidate(index, { text: event.target.value })} />
                    </label>
                    <div className="st-field-row" style={{ gap: 8, alignItems: 'end' }}>
                      <label className="st-field" style={{ flex: 1, minWidth: 80 }}><span>Estimated font</span>
                        <input className="st-input" value={component.fontFamily ?? 'Arial'} onChange={(event) => patchRasterCandidate(index, { fontFamily: event.target.value })} />
                      </label>
                      <label className="st-field" style={{ width: 82 }}><span>Size</span>
                        <input className="st-input" type="number" min={1} max={300} value={component.fontSize} onChange={(event) => patchRasterCandidate(index, { fontSize: Math.max(1, Math.min(300, Number(event.target.value) || 1)) })} />
                      </label>
                      <label className="st-field" style={{ width: 56 }}><span>Color</span>
                        <input type="color" value={component.color} onChange={(event) => patchRasterCandidate(index, { color: event.target.value })} aria-label={`Text color for region ${index + 1}`} style={{ width: '100%', height: 34 }} />
                      </label>
                    </div>
                    <div className="st-field-row" style={{ gap: 8, alignItems: 'end' }}>
                      <label className="st-field" style={{ flex: 1 }}><span>Alignment</span>
                        <select className="st-select" value={component.align} onChange={(event) => patchRasterCandidate(index, { align: event.target.value as RasterTextCandidate['align'] })}>
                          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                        </select>
                      </label>
                      <label className="st-field" style={{ flex: 1 }}><span>Weight</span>
                        <select className="st-select" value={component.fontWeight ?? 'normal'} onChange={(event) => patchRasterCandidate(index, { fontWeight: event.target.value as 'normal' | 'bold' })}>
                          <option value="normal">Regular</option><option value="bold">Bold</option>
                        </select>
                      </label>
                    </div>
                    <div className="st-field"><span>Region bounds (0–1000: X, Y, W, H)</span>
                      <div className="st-field-row" style={{ gap: 5 }}>
                        {(['x', 'y', 'w', 'h'] as const).map((key) => (
                          <label key={key} className="st-field" style={{ width: 0, flex: '1 1 0' }}><span>{key.toUpperCase()}</span>
                            <input className="st-input" type="number" min={key === 'w' || key === 'h' ? 1 : 0} max={1000} value={component.bounds[key]}
                              onChange={(event) => {
                                const min = key === 'w' || key === 'h' ? 1 : 0;
                                const value = Math.max(min, Math.min(1000, Math.round(Number(event.target.value) || min)));
                                const next = { ...component.bounds, [key]: value };
                                next.w = Math.max(1, Math.min(1000 - next.x, next.w));
                                next.h = Math.max(1, Math.min(1000 - next.y, next.h));
                                patchRasterCandidate(index, { bounds: next });
                              }} />
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="editor-hint" style={{ margin: 0 }}>Background: {component.backgroundKind ?? 'unknown'} · {component.italic ? 'italic' : 'not italic'}.</div>
                  </div>
                )) : <p className="editor-hint">No readable text was recognized confidently. Use the image unchanged, or cancel and try a clearer source.</p>}
              </div>
            </div>
            <p className="editor-hint" style={{ margin: 0 }}>
              Only selected text boxes are changed. Cleanup touches glyph-like pixels inside reviewed bounds; decorative lettering or photo/gradient backgrounds can still need manual correction. Unselected image content remains embedded.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', paddingTop: 4 }}>
              <button type="button" className="st-btn" onClick={() => setRasterReview(null)} disabled={isApplyingRasterText}>Cancel</button>
              <button type="button" className="st-btn" onClick={() => void installRasterImageUnchanged()} disabled={isApplyingRasterText}>Use image unchanged</button>
              <button type="button" className="st-btn st-btn--primary" onClick={() => void applyRasterTextReview()} disabled={isApplyingRasterText || (rasterReview?.components.filter((component) => component.selected).length ?? 0) === 0}>
                {isApplyingRasterText ? <LoaderCircle size={13} className="studio-upload-spinner" /> : null}
                Grab selected text ({rasterReview.components.filter((component) => component.selected).length})
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isUploadingImage ? (
        <div className="studio-upload-overlay" role="status" aria-live="polite" aria-label="Uploading image">
          <div className="studio-upload-dialog">
            <LoaderCircle size={22} className="studio-upload-spinner" />
            <strong>Uploading image</strong>
            <span>Keep this editor open until the image has been added to the canvas.</span>
          </div>
        </div>
      ) : null}
    </div>
  );

  function canvasDrop(index: number, event: React.DragEvent) {
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
  }
}
