# QA Results — verified 2026-10-26

Environment: Linux, Node 24, feature branch `feat/studio-template-library-500-20261023`. Every result below was produced by running the exact command shown this session.

## Automated gates (all executed, all green)

| Check | Command | Result |
|---|---|---|
| Catalogue audit (9 gates × 500 templates) | `npx vitest run lib/studio/template-library/audit.test.ts` | **9/9 passed** — exactly 500; exact category counts (110/70/50/60/45/40/35/35/25/30); zero duplicate ids/names; metadata complete; every build schema-valid (`contentDocumentSchema`); geometry on-canvas (25% bleed tolerance); zero structural-fingerprint duplicates; every template findable by its own name; accent-independent structure |
| Template builder unit tests | `npx vitest run lib/studio/template-library/build.test.ts` | 5/5 passed (schema-valid docs, deterministic ids, gradient round-trip, vector art mapping, accent-slot substitution, fingerprint differentiation) |
| Full test suite | `npm test` (vitest run + `node --check scripts/brand-iq-compatibility.mjs`) | **735/735 passed**, 0 failed |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | exit 0, no errors |
| Production build | `npm run build` (`next build`) | succeeded (route table emitted, no errors) |

## Catalogue integrity detail

- Total: 500 (asserted against `TEMPLATE_TOTAL`).
- Per-category counts match the mission table exactly (`libraryCountByCategory()` vs `TEMPLATE_CATEGORY_COUNTS`).
- Structural uniqueness enforced by `templateFingerprints` (geometry quantized to 16px buckets, color ROLES not colors, text-length + font-size buckets). Starting point this session: 86 collisions → resolved with real composition variants (new archetype option families: storyPromo decors, photoHero overlays, adBanner cta/panel styles, countdown decors, deck section/stat/bullet variants, productShowcase photo/layout, bundle banner, compare swap, catalog columns, letterhead/business-card variants, edu poster styles, course header, cycle row layout, timeline side, brief accent bar, proposal split, announcement centering, resume sidebar, editorial rules/lines). No collision was "fixed" by color/name/tag-only changes.
- Catalog listing generated from live data: `docs/studio-template-library/CATALOG.md` via `scripts/generate-template-catalog.ts` (command in file header; output regenerated this session).

## Audit history this session (honest record)

1. Initial run: 6/9 — duplicate name `Event Story — Doors Tonight`, `t-soc-012` short tags, 86 fingerprint duplicates.
2. After 25 composer variant families + 86 catalog re-options: 8/9 — 7 residual collisions (pool saturation).
3. After round-2 options + editorialCover 4-line support: 8/9 — 1 geometry defect (adBanner corner arc fully off-canvas at `x=100%`).
4. Final: **9/9**.

## Browser / visual verification — PASSED (2026-10-26, Playwright + dev server + local Supabase)

Verified against a DRAFT content item in the seeded Aurora Labs workspace, signed in as the seed presenter user:

| Check | Result |
|---|---|
| Templates tab opens, panel renders | ✅ "Showing all 500 templates", 24 cards mounted, 24/24 lazy thumbnails rendered as real `ContentDocumentView` output |
| Search | ✅ "pitch" → "9 of 500 templates match", correct names; clear resets |
| Category filter | ✅ presentation → "45 of 500 templates match" (exact) |
| Preview dialog | ✅ title, live page render, 5 page dots switch pages, actions present |
| Multi-page apply | ✅ confirm dialog (exact copy), "Add all 5 pages": document 2 → 7 page tabs, 46 blocks on canvas, notice shown; other pages preserved |
| Read-only policy | ✅ APPROVED item renders the library with controls disabled (`canEdit` intact) |
| Save + reopen | ✅ "Save new version" → reload → 7 tabs / 46 blocks restored from the server body |
| Page gradients | ✅ after adding gradients to 12 catalogue templates, computed thumbnail style shows `linear-gradient(160deg, …)` |
| Console | ✅ no app errors (only a pre-existing site-manifest parse warning, unrelated to this feature) |
| Rotation input | code-verified; not click-driven this pass (input follows the existing geometry path) |

Reproduce with:
  ```bash
  npm run dev   # open a content item editor → inspector → Templates tab
  ```
  Checklist: search + Enter + clear; category/format/style filters compose; card thumbnails match applied canvas; preview dialog page dots; "Replace page N" (confirm dialog) and "Add all N pages" (≤10 cap); gradient From/To/angle in Design tab; rotation input in Arrange tab; save → reopen retains template styling.

## Existing behavior protection

- `lib/content/document.test.ts` 19/19 (legacy bodies, flat/pages forms, channel fitting, reflow) — pre-existing tests untouched and passing.
- Studio save/version, approval, publishing code paths: untouched by this branch (diff scope: template library, additive schema field + background resolver + inspector controls + workspace template functions). `proxy.ts`, `AI_EXECUTION_MODE`, RLS, roles, publishing state machines: no changes.

## Remaining limitations

1. Rotation input not click-driven in the browser pass (follows the pre-existing, tested geometry path).
2. `components/content/studio-free-canvas.tsx` is dead code predating this work — left untouched.
3. Canva→native automated import unavailable (see CANVA-MCP-RESEARCH.md).
