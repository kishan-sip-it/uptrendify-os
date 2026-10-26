# Studio Template Library — PLAN

Feature branch: `feat/studio-template-library-500-20261023` (base: `origin/main` @ `4d45080`, verified equal to local `main` at session start, clean tree).

## Verified baseline (Phase A, 2026-10-23)

Sources of truth inspected at `4d45080`:

| Area | File | Verified behavior |
|---|---|---|
| Document model | `lib/content/document.ts` | `uptrendify-doc` v1. Pages (max 10) of blocks (max 40). Block types: `heading` (L1–3, fontSize 8–160, fontFamily, richText runs), `text` (sm–xl + fontSize), `image` (http(s)/managed-asset URL only), `shape` (rectangle/square/circle/triangle/star/pyramid **plus arbitrary vector via `svgPath`+`svgBounds`+`svgMatrix`**), `button` (CTA). Geometry `{x,y,w,h,rotation}`, w/h ≥ 24. Page: size (8 presets), `bg` hex, `backgroundImage`, optional raster `snapshot`. Zod-validated; single page serializes flat, multi-page uses `pages`. |
| Current templates | `lib/studio/templates.ts` | Exactly 4 `STUDIO_TEMPLATES`; `build(accent) → ContentDocPage`; geometry authored on a 760×1351 reference frame and scaled per page size. No metadata (category/tags/preview). |
| Apply flow | `components/content/content-editor-workspace.tsx:2168` | `applyTemplateToActivePage` replaces **only the active page**, preserves all other pages, switches to free mode, requires confirm (`insertTemplate`) when the page has content. Existing behavior kept. |
| Templates UI | same file `:3784` | Inspector “Templates” tab = flat list of 4 text buttons. No search/filter/preview/thumbnail. This is the holder to upgrade. |
| Rendering | `components/content/content-document-view.tsx` | Single canonical renderer for saved bodies (detail card, approvals, publishing, editor preview). Free-mode absolute layout, svgPath shapes, richText runs, opacity, rotation. |
| Canvas/snapshot | workspace `:3131` (`renderBlockInner`), `:4526` (snapshot host) | Same schema rendered for editing and html-to-image snapshot export. |
| SVG import | `lib/studio/import-template.ts` | SVG markup → native blocks (text/image/vector). Proven, tested. |
| Rotation | schema + both renderers | Supported in data and rendering; **no rotation editing UI** (gap, see EDITOR-GAP-LOG). |
| Tests | `vitest` (node env), `npm test` | `lib/**/*.test.ts` etc. zod round-trip style tests exist in `lib/content/document.test.ts`. |
| Scripts | `package.json` | `dev`, `build`, `start`, `typecheck`, `test`, `brand:compat`. Node 24, Next 16.3.5, React 19, zod 4. |

`components/content/studio-free-canvas.tsx` exports `StudioFreeCanvas` but **no importer uses it** (verified by grep); the workspace renders free canvas inline. Untouched by this task.

## Scope

1. Exactly **500** curated, distinct, original templates in 10 categories with exact counts (110/70/50/60/45/40/35/35/25/30).
2. A polished Template Library UI inside the existing inspector Templates holder: search (+ button, Enter, clear), category/format/style filters, sort, lazy-rendered cards with schema-accurate thumbnails, large preview, safe apply (page-replace with confirm; multi-page insert capped at 10 pages), result counts, empty states, keyboard/aria support, responsive.
3. Native editability: every template is a real `ContentDocument` (mode `free`); thumbnails render via the canonical `ContentDocumentView`.
4. Smallest reusable editor upgrades only where templates require them (see EDITOR-GAP-LOG): page background gradient (additive schema field), rotation control in Arrange inspector, multi-page apply operation.
5. Docs + automated audit gates + tests + typecheck + build on the feature branch only. No `main`, no Production, no deploy, no merge.

## Phases

- **A — Preflight & audit** (this doc; branch; baseline table; Canva MCP findings).
- **B — Native primitives**: template definition types + deterministic builder; page `bgGradient` field (schema + 3 render surfaces + inspector + tests); rotation input in Arrange; multi-page apply.
- **C — Library experience**: `components/content/studio-template-library.tsx` panel; thumbnail + preview via `ContentDocumentView`; workspace integration (replace templates tab contents; keep `insertTemplate` confirm semantics).
- **D — Catalogue**: archetype system + curated per-template specs; 10 category files; audit test enforcing every gate in §8 of the mission.
- **E — Verification**: `npm test`, `npm run typecheck`, `npm run build`, audit; representative manual/browser checks; fix defects.
- **F — Handoff**: docs finalized (CATALOG/COMPATIBILITY-MATRIX/QA-RESULTS/IMPLEMENTATION-LOG), branch left unmerged.

## Acceptance criteria

- `STUDIO_LIBRARY.length === 500`; category counts exactly per mission table; zero duplicate ids/names; zero empty metadata; every template builds a schema-valid document (`contentDocumentSchema.safeParse`); composition fingerprints unique; search finds every template by its own name; apply/edit/save/reopen preserves template styling (existing save/version flow untouched).
- All quality gates in mission §8 pass with real output in QA-RESULTS.md.
