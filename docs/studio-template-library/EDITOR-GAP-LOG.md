# Editor Gap Log

Gaps encountered while designing 500 templates against the native editor. Each entry: the gap, evidence, affected templates, resolution, and validation. No template feature was silently flattened, faked, or dropped.

## GAP-1 — Page background gradients not supported

- **Evidence:** `contentDocPageSchema` (pre-branch) had solid `bg` + raster `backgroundImage` only. Gradient fills appear throughout modern template design (heroes, decks, story promos).
- **Affected templates:** 40+ across social stories, marketing campaigns, pitch covers, event promos (any design using `gradient` page spec).
- **Resolution (smallest reusable, additive):** new optional `gradient { from, to, angle }` on `contentDocPageSchema`; one shared resolver `pageBackgroundStyles()` used by all three render surfaces (editor canvas frame, snapshot export host, `ContentDocumentView`); Design-tab controls (From/To color, angle, remove; hidden when a background image is present, matching image-precedence). Absent on all pre-existing bodies — fully backward compatible.
- **Bonus fix:** flat single-page serialization previously **dropped page `bg` entirely** (pre-existing bug found during this work); now persists `bg` + `gradient`.
- **Validation:** `document.test.ts` 19/19 (incl. gradient round-trip), `build.test.ts` gradient assertions, full suite 735/735; typecheck + production build pass.
- **Status:** CLOSED.

## GAP-2 — Rotation rendered but not editable

- **Evidence:** `geometry.rotation` existed in schema and both renderers pre-branch; no input anywhere in the inspector (grep `rotation` in workspace: render sites only).
- **Affected templates:** any using rotated elements (diamond bullets in `lessonSummary`, decorative rotated squares); also users who want rotated text/shapes.
- **Resolution:** Arrange-tab rotation number input (-180…180) + Reset writing the existing field via extended `updateBlockGeometry`; zero is stored as absent to keep serialization canonical.
- **Validation:** typecheck; full suite; browser-level interaction UNVERIFIED this session (documented in QA-RESULTS).
- **Status:** CLOSED (UI addition; data path pre-existing and tested).

## GAP-3 — Templates needing multi-page sequences (carousels, decks)

- **Evidence:** `applyTemplateToActivePage` replaced only the active page — correct for single-page templates, insufficient for 5-page carousels and decks.
- **Affected templates:** all multi-page catalogue entries (carousel guides, deck sequences, newsletters with recap pages).
- **Resolution:** `applyTemplateAsPages` — replaces the active page with template page 1, inserts remaining pages after it, refuses beyond `CONTENT_DOC_MAX_PAGES` (10) with a clear error; confirm dialog states exactly what happens; other pages never touched.
- **Validation:** audit enforces ≤10 pages/template; logic reviewed; browser interaction UNVERIFIED this session.
- **Status:** CLOSED.

## GAP-4 — Photographic template styles with no safe image source

- **Evidence:** `imageSource` accepts only http(s) URLs or managed `/api/brands/...` asset paths — data URIs are deliberately rejected (schema hardening). Bundled templates cannot reference user assets and must not ship broken external links.
- **Affected templates:** every "photo" style (heroes, showcases, editorial covers, real estate).
- **Resolution (design-level, no hack):** photo areas are built as labeled placeholder compositions (soft panel + image icon vector + caption) from native shapes; users drop their own image via the existing Insert-image flows (URL or upload) or set a page background image. Zero external image URLs exist in the catalog (audit-greppable).
- **Status:** CLOSED (by design; documented here and in COMPATIBILITY-MATRIX).

## GAP-5 — Decorative vector variety (icons, waves, seals, diagram glyphs)

- **Evidence:** native primitives were the 6 clip-path shapes; rich illustrations were only reachable via SVG import.
- **Affected templates:** nearly all (badge marks, waves, confetti dots, seals, chart glyphs, rings, arrows).
- **Resolution:** none needed — the pre-existing `svgPath`/`svgBounds`/`svgMatrix` shape layer already renders arbitrary vectors in both renderers and survives serialization. The library ships ~40 original hand-authored vector pieces (`art.ts`) through it; each piece lands as an independently editable, recolorable layer.
- **Status:** NOT A GAP (capability verified and used).

## Not implemented (accepted limitations)

- **Per-block gradient fills:** no current template requires it; page-level gradient covers the design need. Reopen if a template family genuinely needs it.
- **Canva→native automated import:** impossible with verified MCP tools (no SVG export; see CANVA-MCP-RESEARCH.md). Not a template-content gap.
