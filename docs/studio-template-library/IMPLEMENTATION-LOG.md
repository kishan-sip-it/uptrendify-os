# Implementation Log — Studio Template Library 500

## Session 2 — 2026-10-26 (resumed from checkpoint `1a8fc9b`)

### Resumed state verified

Branch `feat/studio-template-library-500-20261023` at `1a8fc9b`, clean tree, base `4d45080` = `origin/main`. Audit reproduced the 3 documented failures (1 duplicate name, 1 short tag list, 86 fingerprint duplicates).

### Duplicate-resolution approach (86 → 0, no gaming)

Root cause: catalogue entries shared identical (archetype, format, options) tuples. Fixed at the composition level:

1. **25 composers gained real structural variants** in `archetypes.ts` (all additive options, all rendering genuinely different layouts):
   - `storyPromo`: decor += wave, corner, dots, stripes, arcBottom
   - `photoHero`: overlay += top, corner, side
   - `beforeAfter`: splitStyle vertical|horizontal (stacked halves)
   - `adBanner`: ctaSide += bottom, split; panelStyle += wave, dots, corner
   - `countdownPost`: decor band|dots|ring|arc
   - `eventInvite`: decor += ring
   - `editorialCover`: rules (masthead bars); coverLines up to 4
   - `blogHeader`: rule (accent underline); waveSide bottom|right
   - `deckSection`: align left|right, fill, badgeStyle plain|circled
   - `deckStats`: align left|center, divider rules
   - `deckBullets`: panelSide right|none|left
   - `productShowcase`: photoStyle panel|circle|arch, layout stacked|split
   - `bundlePromo`: bannerStyle ink|accent|paper
   - `featureCompare`: swapColumns
   - `catalogGrid`: columns 2|3 (real 3-col grid geometry)
   - `letterhead`: markSide left|right
   - `businessCard`: accentBand bottom
   - `eduPoster`: icon leaf|sun|book|moon, style disc|panel
   - `coursePromo`: headerStyle dark|accent
   - `cycleDiagram`: layout ring|row (linear arrow flow)
   - `timelineVertical`: lineSide left|right
   - `projectBrief`: accentBar
   - `proposalCover`: layout classic|split (right-panel composition)
   - `announcementDoc`: align left|center
   - `resumePage`: sidebar (ink rail + accent mark)
2. **86 catalog entries re-optioned** to distinct variants via an anchored patch script (every edit reported applied; two entries re-archetyped where the pool was saturated and another layout fit the use case: `t-eco-022` → typePoster, `t-edu-012` → typePoster, `t-mkt-002` → typePoster, `t-eco-048` → photoHero, `t-mkt-060` → productShowcase).
3. Round-2 residual: 7 collisions (pool saturation) + 1 geometry defect (adBanner corner arc authored at x=100% = fully off-canvas) → fixed in the composer (arc straddles the edge) and final options applied.
4. Metadata: `t-soc-083` renamed `Concert Story — Doors Tonight`; `t-soc-012` gained the tag `golden hour`. Also cleaned stray `label: ''` keys from countdown options.
5. The fingerprint gate (roles + quantized geometry + text/font buckets) stays in `audit.test.ts` so identical compositions cannot silently return.

### Verification (all run this session)

- `npx vitest run lib/studio/template-library/audit.test.ts` → **9/9**
- `npm test` → **735/735** (full suite incl. pre-existing document/schema/pipeline tests + `node --check` script gate)
- `npm run typecheck` → clean (exit 0)
- `npm run build` → production build succeeded
- `docs/studio-template-library/CATALOG.md` regenerated from live library via committed `scripts/generate-template-catalog.ts` (esbuild → node; command in file header)

### Docs completed this session

`CATALOG.md` (generated, 500 rows), `COMPATIBILITY-MATRIX.md`, `EDITOR-GAP-LOG.md`, `QA-RESULTS.md`, this log. `PLAN.md`/`ARCHITECTURE.md`/`CANVA-MCP-RESEARCH.md` from session 1 remain accurate.

### Commit (this session)

Single feature-branch commit on top of `1a8fc9b`: uniqueness variants, audit fixes, generated catalog + remaining docs. `main` untouched; nothing pushed, merged, or deployed.

### Honest remaining items

1. Browser-level UI verification (dev server → Templates tab) not executed this session — checklist in QA-RESULTS.md. Code paths, schema, and renderers are unit-verified.
2. Canva→native import remains impossible with verified MCP tools (documented).
3. Dead pre-existing component `studio-free-canvas.tsx` intentionally untouched.
