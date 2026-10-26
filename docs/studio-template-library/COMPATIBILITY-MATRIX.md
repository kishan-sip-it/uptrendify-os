# Compatibility Matrix — template requirements vs native editor support

Verified against source at `4d45080` + this branch. Every row cites implementation or test evidence. "Both renderers" = the editor canvas/snapshot host (`content-editor-workspace.tsx` `renderBlockInner`, snapshot host) and the canonical saved-body renderer (`content-document-view.tsx`).

| Capability | Native status | Implementation | Serializer | Canvas | Saved-body view | Snapshot/thumbnail | Tests |
|---|---|---|---|---|---|---|---|
| Headings L1–3, fontSize 8–160, fontFamily | ✅ pre-existing | `lib/content/document.ts` heading block | ✅ flat + pages | ✅ | ✅ | ✅ | `document.test.ts`, `build.test.ts` |
| Body text sm–xl + explicit px size | ✅ pre-existing | same | ✅ | ✅ | ✅ | ✅ | same |
| Rich-text inline runs (bold/italic/underline/color/bg/size/font per run) | ✅ pre-existing | `inlineTextRuns` | ✅ | ✅ (CanvasText) | ✅ `renderInlineText` | ✅ | `document.test.ts` |
| Text alignment left/center/right | ✅ pre-existing | `align` | ✅ | ✅ | ✅ | ✅ | audit geometry + schema |
| Text/background chip fills (`bg`) | ✅ pre-existing | block `bg` | ✅ | ✅ | ✅ | ✅ | schema round-trip |
| Rectangles, squares, circles, triangles, stars, pyramids | ✅ pre-existing | `CONTENT_SHAPE_KINDS` | ✅ | ✅ | ✅ | ✅ | schema enum |
| **Arbitrary vector shapes (icons, waves, blobs, seals, diagrams)** | ✅ pre-existing | `svgPath` + `svgBounds` + identity `svgMatrix`; fill or stroke mode (`svgFillNone`, `svgStroke`, `svgStrokeWidth`) — used by every art piece in `lib/studio/template-library/art.ts` | ✅ | ✅ `renderBlockInner` | ✅ | ✅ | `build.test.ts` (art block structure), schema refine |
| Free-canvas geometry `{x,y,w,h}` + drag/resize | ✅ pre-existing | mode `free`; geometry clamp helpers | ✅ | ✅ | ✅ absolute positioning | ✅ | audit bounds test (500 templates) |
| **Rotation** | ✅ schema pre-existing; **editing UI added this branch** | Arrange tab rotation input → `updateBlockGeometry('rotation')`; renderers pre-existing | ✅ | ✅ | ✅ | ✅ | manual UI (UNVERIFIED in browser); render paths pre-existing |
| Per-element opacity, hidden, locked | ✅ pre-existing | `flags` | ✅ | ✅ | ✅ | ✅ hidden filtered | schema |
| **Page background gradient** | ✅ **added this branch** | `contentDocPageSchema.gradient {from,to,angle}`; shared `pageBackgroundStyles()` | ✅ flat + pages (also fixed flat `bg` persistence) | ✅ canvas frame | ✅ | ✅ snapshot host | `document.test.ts` round-trip, `build.test.ts` gradient assertions |
| Page background image | ✅ pre-existing | `backgroundImage` | ✅ | ✅ | ✅ | ✅ | `document.test.ts` |
| Multi-page documents (≤10 pages) | ✅ pre-existing | `pages` form serialization | ✅ pages form | ✅ page tabs | ✅ `pageIndex` | ✅ | `document.test.ts` |
| **Multi-page template apply** | ✅ **added this branch** | `applyTemplateAsPages` (workspace): replaces active page with page 1, inserts the rest after, hard-capped by `CONTENT_DOC_MAX_PAGES` with explicit error; confirm dialog | via existing `commit` | ✅ | ✅ | n/a | catalog audit page-count ≤10; UNVERIFIED in browser |
| CTA buttons (text + color, href optional) | ✅ pre-existing | `button` block | ✅ | ✅ | ✅ | ✅ | schema |
| Images (http(s) URLs, managed asset paths) | ✅ pre-existing | `imageSource` refine | ✅ | ✅ | ✅ | ✅ | schema tests |
| **Editable image placeholders in templates** | ✅ by design | Templates use labeled placeholder panels (soft shapes + caption text); the user drops their own image via the existing Insert → image URL / upload flow. Data-URI images are NOT permitted by the schema (hardening), so templates ship no broken asset links. | n/a | n/a | n/a | n/a | audit: zero external image URLs in catalog (grep) |
| Search/filter metadata (category, tags, use case, audience, style, format) | ✅ **added this branch** | `TemplateDefinition` + `templateSearchBlob`; panel filters/sort in `studio-template-library.tsx` | n/a (library is bundled data) | n/a | n/a | n/a | audit “is searchable” gate (every template matches its own name) |
| Thumbnails identical to applied design | ✅ **added this branch** | Cards + preview render the built `ContentDocument` via `ContentDocumentView` — the same renderer used for saved versions/approvals/publishing | n/a | n/a | ✅ (it IS the same renderer) | ✅ lazy-mounted | `build.test.ts` determinism |
| Deterministic ids (server/client render parity) | ✅ **added this branch** | `hashId`-derived block/page ids in `build.ts` (same discipline as legacy `templates.ts`) | ✅ | ✅ | ✅ | ✅ | `build.test.ts` “deterministic ids” |
| Brand-accent tinting | ✅ **added this branch** | Accent substitution only into slots marked `'accent'` in the spec; ink/paper untouched | ✅ | ✅ | ✅ | ✅ | `build.test.ts` accent test; audit accent-independence gate (500) |
| Version save/reopen, local drafts, snapshots, approval flows | ✅ untouched | Existing `commit`/save/version semantics unchanged by this branch | ✅ | ✅ | ✅ | ✅ | full suite 735/735 |

## Known limitations (documented, non-blocking)

1. **No raster photos inside templates** — by schema design (`imageSource` allows only http(s)/managed paths; no data URIs). Photographic template styles ship as labeled placeholder frames; users add their own images. Zero external/broken image URLs in the catalog.
2. **Gradient is page-level only** — per-block gradient fills are not supported (blocks keep solid `bg`). Log entry in EDITOR-GAP-LOG.md; no current template requires per-block gradients.
3. **`components/content/studio-free-canvas.tsx`** is an unused pre-existing component (verified by grep); it was not migrated to `pageBackgroundStyles`. No runtime surface uses it.
