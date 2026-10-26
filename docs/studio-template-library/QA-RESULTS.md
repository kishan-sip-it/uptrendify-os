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

## Browser / visual verification

- **UNVERIFIED this session.** No browser automation run was executed against the dev server in this session; card/preview rendering, apply flows, gradient controls and the rotation input have been verified at the unit/schema/render-code level only. Reproduce visually with:
  ```bash
  npm run dev   # open a content item editor → inspector → Templates tab
  ```
  Checklist: search + Enter + clear; category/format/style filters compose; card thumbnails match applied canvas; preview dialog page dots; "Replace page N" (confirm dialog) and "Add all N pages" (≤10 cap); gradient From/To/angle in Design tab; rotation input in Arrange tab; save → reopen retains template styling.

## Existing behavior protection

- `lib/content/document.test.ts` 19/19 (legacy bodies, flat/pages forms, channel fitting, reflow) — pre-existing tests untouched and passing.
- Studio save/version, approval, publishing code paths: untouched by this branch (diff scope: template library, additive schema field + background resolver + inspector controls + workspace template functions). `proxy.ts`, `AI_EXECUTION_MODE`, RLS, roles, publishing state machines: no changes.

## Remaining limitations

1. Browser-level UI verification listed above still to be performed (or by product owner).
2. `components/content/studio-free-canvas.tsx` is dead code predating this work — left untouched.
3. Canva→native automated import unavailable (see CANVA-MCP-RESEARCH.md).
