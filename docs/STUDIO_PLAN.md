# STUDIO_PLAN.md — UpTrendifyOS "Studio" editor

Master prompt: brand-aware interactive design/content editor. This file is the
running audit + phase checklist. Updated per phase.

## S0 audit (2026-10-21, branch `feat/studio-editor`)

### What already exists (verified in code — reuse, do not rebuild)

| Area | File(s) | State |
|---|---|---|
| Document model | `lib/content/document.ts` | `uptrendify-doc` v1 JSON inside `content_versions.body`. Pages (multi-page), heading/text/image/shape/button blocks, align/colour/bg/size/emphasis, shape kinds (rect/square/circle/triangle/star/pyramid), safe-URL + kind validation, plain-text projection, `reorderBlocks`. Tested (10 tests). |
| Shared renderer | `components/content/content-document-view.tsx` + `app/content-document.css` | Same renderer used by detail, approvals, publish preview. Paper-white in all themes. |
| Editor workspace | `components/content/content-editor-workspace.tsx` + `app/(app)/brands/[brandId]/content/[contentId]/editor/page.tsx` + `app/content-editor.css` | Dedicated route. Top bar (back/title/version/save-state/history/preview/save/submit), layers panel (drag reorder + grip), canvas (inline text edit, floating toolbar, corner-tick selection, drop lines, zoom), properties panel, version picker, format bar (B/I/U, sizes, colours, align), page tabs, per-type canvas presets (A4 default; square/story for social/video), white-paper in dark mode. |
| Save/version/submit | `PATCH /api/brands/[id]/content/[cid]` + `POST …/review` + RPC `apply_content_review_transition` | New-version-per-save, version-pinned approval, body-edit status guard (`lib/content/edit-policy.ts`), atomic RPC + ledger. Verified E2E (rolled-back SQL + browser). |
| Previews | `content-detail.tsx` VersionCard, `app/(app)/approvals/queue.tsx`, `components/publishing/publish-preview.tsx`, `app/api/approvals/route.ts` | All render the structured document. Publish connectors are text-only (`lib/publish/service.ts` converts at the boundary). |
| Brand brain | `lib/strategy/*`, `brand_suggestions`, `brand_facts`, approved-facts gate | Strategy pipeline reads approved facts/insights; gate enforced server-side. |
| AI abstraction | `lib/ai/*` (registry, failover, retry, replay mode) | `runWithProviderFailover`, `withTransientRetry`, `AI_EXECUTION_MODE=replay`. |
| Theme/tokens | `app/globals.css`, `design-system.css`, `ui-foundation.css`, `ui-primitives.css`, `shared-theme.css`, theme controller (System default) | Tokens exist; Studio adds its own layer on top. |
| Fonts | system stack (no `next/font` yet) | Studio introduces a curated `next/font` set (open-licensed) scoped to the editor. |

### Gaps vs the Studio concept (what S1+ adds)

Scene-graph freeform canvas (x/y/rotation/constraints), command bar (⌘K),
marquee/group/lock, rotate + 8-way resize handles, magnetic snapping + guides,
pinch/trackpad gestures, magic-resize format strip + constraint reflow,
variants compare, brand lint + health ring, linked content fields, channel
meters, comment pins + version timeline diffs, export PNG/JPG/SVG/PDF,
document (rich-text) mode, dock/drawer/inspector responsive shell, focus mode,
onboarding tour, shortcut sheet, a11y pass, perf pass (rAF batching,
`useSyncExternalStore`, virtualised rendering).

### Persistence decision (no new migration needed)

The design document is the existing versioned `body` JSON. The current
`uptrendify-doc` model (stacked blocks per page) already covers page-based
documents. The Studio freeform scene (`x/y/w/h/rotation/constraints`) will be
**added to the same body JSON as optional per-block geometry** and a document
`mode` flag ("page" | "free") — additive keys with safe defaults; every legacy
body parses unchanged (parse defaults proven by tests). No schema migration,
no new table: versions stay immutable, pinned, and approval-identical.

### Data-flow invariants (must never break)

- Save always creates a NEW `content_versions` row; `current_version_id` moves.
- Approval/review pins `content_version_id`; body edits blocked outside
  `DRAFT/CHANGES_REQUESTED/REJECTED` (`lib/content/edit-policy.ts`).
- Submit submits the exact saved current version; the editor blocks submit
  while dirty or while an older version is on canvas.

### Risks

- Freeform canvas on top of the current stacked renderer: the shared renderer
  must learn geometry (absolute positioning when `mode:"free"`) without
  changing stacked rendering for existing bodies.
- Publish connectors remain text-only: rich export stays a preview-layer
  feature until a channel supports richer payloads.
- Perf: 200-node drag target — requires the external store + rAF batching
  before S2 is called done.

### Phase checklist

- [x] S0 Audit + plan + baseline screenshots (this commit)
- [ ] S1 Shell + design system (Studio tokens layer, dock, inspector, top/bottom bars, focus mode, command bar, responsive modes)
- [ ] S2 Canvas engine (scene graph + external store, marquee, handles, rotate, snapping/guides, nudge, group, layers drag, zoom/pan/pinch, history coalescing, autosave)
- [ ] S3 Contextual editing (floating toolbar, in-place text, adaptive inspector, brand pickers, image fit)
- [ ] S4 Brand intelligence (Brand Brain panel, brand lint + fixes + health ring, linked fields, channel meters)
- [ ] S5 AI in canvas (Ask-AI on selection, 3 variants, evidence chips, replay-mode deterministic)
- [ ] S6 Formats + export + review (magic resize strip, PNG/JPG/SVG/PDF, comment pins, version timeline, review wiring)
- [ ] S7 Polish + QA (states, tour, shortcut sheet, perf 200-node, a11y, dark parity, screenshot matrix)

### S0 observed issues (from the 8 baseline screenshots)

- The editor renders INSIDE the workspace column (side nav + AI command card
  still visible) with a large empty band above the canvas — the S1 shell must
  own the full viewport height (`100dvh` grid) at ≥1100px.
- Dark-mode parity is incomplete at app level: with `data-theme="system"` +
  OS dark, the editor chrome still renders light. The paper sheet correctly
  stays white. S1 must verify the system-dark chain (boot script → tokens).
- At 375/768 the canvas sheet shrinks below its preset width (responsive cap
  works) but the layers/insert/properties panels stack above it, pushing the
  canvas far down — the S1 tablet/mobile sheet layout replaces this stacking.
- The floating format bar only appears with a selection (correct) and the
  submit button is disabled while unsaved (correct).

### Baseline screenshots (S0)

`docs/studio-screenshots/s0-editor-{375,768,1280,1536}-{light,dark}.png`
(taken from the current editor route on the demo workspace).
