# Studio Template Library — ARCHITECTURE

Status: living document; updated as phases land. Facts cite paths; unverified items marked `UNVERIFIED`.

## Data flow

```
TemplateDefinition (declarative spec, lib/studio/template-library/catalog/*.ts)
  → buildTemplateDocument(def, accent)      (lib/studio/template-library/build.ts)
  → ContentDocument  { kind:'uptrendify-doc', version:1, mode:'free', pages[] }
      → schema-validated by contentDocumentSchema (lib/content/document.ts)
      → serializeContentDocument → apply via existing workspace commit path
      → rendered anywhere by ContentDocumentView (canonical renderer)
```

Thumbnails and the preview dialog render the **same** built `ContentDocument` through
`ContentDocumentView` (`components/content/content-document-view.tsx`) — the same
component used for saved versions, approvals and publishing. One renderer, zero drift.

## Template definition model

`lib/studio/template-library/types.ts`:

- `TEMPLATE_CATEGORIES` — the 10 mission categories with exact required counts.
- `TemplateDefinition` — `id` (stable, `t-<cat>-<slug>`), `name` (unique), `category`, `subcategory`, `format` (`ContentPageSizeId`), `style`, `useCase`, `audience`, `tags[]`, `pages: TemplatePageSpec[]` (1–10).
- `TemplatePageSpec` — `size`, `bg?`, `gradient? {from,to,angle}`, `blocks: TemplateBlockSpec[]`.
- `TemplateBlockSpec` — content+style+geometry in the page's own pixel space; ids are derived deterministically (`hashId`) in the builder so server/client renders match (same discipline as existing templates, `lib/studio/templates.ts:16`).

Builder rules (`lib/studio/template-library/build.ts`):

- Builds every block through small factories so every emitted block satisfies `contentDocBlockSchema` (required fields present: emphasis booleans, align, color/bg nulls, etc.).
- Vectors: `svgPath` + `svgBounds` + identity `svgMatrix` — a capability that already round-trips schema → workspace renderer (`renderBlockInner`) → `ContentDocumentView` → snapshot export.
- `buildTemplatePage(templateId, accent)` (legacy API in `lib/studio/templates.ts`) extended to resolve library ids and return page 1; legacy 4 `STUDIO_TEMPLATES` remain untouched for compatibility.

## Vector art primitives

`lib/studio/template-library/art.ts`: hand-authored SVG path library (icons, decorative shapes) stored as `{ d, bounds }`, plus palette presets. All art is original, MIT-free (authored in-repo), no network fetch, no license risk.

## Catalogue

`lib/studio/template-library/catalog/<category>.ts` — one file per category. Entries are
**archetype instances**: `archetypes.ts` provides ~40 curated layout composers
(parameters: palette, copy, composition options); each catalogue entry supplies real
subcategory, industry copy, palette, format and composition options so no two entries
share a structural fingerprint (enforced by audit).

`index.ts` assembles + asserts the exact 500/counts at import time (fail-fast in dev/test).

## Library UI

`components/content/studio-template-library.tsx` — replaces the contents of the
inspector “Templates” tab (same holder, `content-editor-workspace.tsx:3784`):

- Search input + explicit Search button + Enter + clear; matches name/subcategory/useCase/audience/tags (client-side, memoized, no network).
- Filters: category (with counts), format, style; sort: curated / title A–Z / Z–A; reset; result count; empty state.
- Cards: lazy-mounted thumbnails (`IntersectionObserver`) rendering page 1 via `ContentDocumentView` scaled to the card box; title, category, format, style badges.
- Preview dialog (AppDialog): large scaled render of every page, full metadata, actions.
- Apply: single-page → existing `insertTemplate` (confirm-protected replace of active page only); multi-page → new `applyTemplatePages` replaces the active page with page 1 and inserts the rest after it, capped by `CONTENT_DOC_MAX_PAGES` with a clear error otherwise. No other pages are ever dropped silently.

## Editor upgrades (smallest reusable, additive)

1. **Page background gradient** — optional `bgGradient {from,to,angle}` on `contentDocPageSchema`; rendered by `ContentDocumentView`, the canvas frame, and the snapshot host as `linear-gradient`; edited from the existing Design tab “Page background” field. Old bodies unaffected (field absent = solid).
2. **Rotation control** — Arrange tab numeric rotation input (free canvas), writing the already-supported `geometry.rotation`.
3. **Multi-page apply** — workspace operation only; no schema change.

Everything else uses existing native capabilities (text/richText, 6 shape kinds, svgPath vectors, buttons, opacity, layer order, page ops, versions).

## Performance

- Catalogue is bundled local data (typed, tree-shaken per category file). No DB, no fetch per search.
- Filtering/sorting memoized; thumbnails lazy-mounted; preview renders on demand only. No editor instances are mounted per card (read-only renderer, no `CanvasText` editing state).
