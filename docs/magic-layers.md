# Magic Layers — research, architecture, and evaluation

Status: implemented on `feat/magic-layers-20261029` (P1). This document records
what was investigated, what was verified, what was built, and what is honestly
NOT verified — so nobody has to re-derive the decisions or mistake an
approximation for a guarantee.

## 1. What Magic Layers does

A user opens the Studio editor's **AI** drawer, chooses a flattened design
image (PNG/JPG/WEBP ≤ 2 MB), and asks for reconstruction. The system:

1. Asks the configured vision model for a structured **layer plan**: a
   background classification plus an ordered element list (text / shape /
   image regions with 0..1000-normalized bounds, per-element confidence).
2. Shows every proposed layer in a **review dialog** with the image, numbered
   boxes colour-coded by kind, editable text/bounds/colours, recognition
   notes, and the dropped-element report. Nothing touches the canvas yet.
3. On apply, verifies the model's colour claims **against the actual pixels**,
   erases the selected elements from a background copy, cuts image layers out
   of the original pixels, uploads everything as managed assets, and builds a
   genuine editable `ContentDocPage`.
4. Asks an explicit in-app confirmation (`setStudioActionDialog`) before
   replacing the canvas. Undo restores it; nothing is saved until the user
   saves a version; the source file is never modified.

The recovered document uses the same blocks, geometry, z-order (block array
order), assets and persistence as hand-built designs — no parallel editor, no
new schema, no new tables.

## 2. Research summary and sources

### Verified (primary sources, checked 2026-10-29/30)

- **Groq vision models** — official docs at https://console.groq.com/docs/vision
  (checked 2026-10-29). `qwen/qwen3.8-27b` is a current Groq multimodal model
  (matching this repo's `GROQ_VISION_MODEL` default), supports `response_format:
  json_object`, accepts base64 data-URL images, OCR is a documented use case,
  request ceiling 20 MB (we send ≤ 2 MB). **Precise bounding-box grounding has
  no official accuracy guarantee** — the plan validator and the human review
  step exist precisely because box quality must be treated as untrusted input.
- **This repository's own precedents** (read firsthand, line-level):
  - `app/api/brands/[brandId]/content/[contentId]/recognize-image/route.ts` —
    the shipped "Grab text from image" feature: Groq vision call with 3-key
    failover, strict zod validation of model output, 0..1000 normalized
    coordinates, honest failure codes. Magic Layers generalizes this from
    text-only to a full element tree.
  - `lib/studio/raster-text.ts` — proven glyph-mask erase with background
    sampling and explicit refusal states (`unsafe-coverage`,
    `no-foreground-match`). Reused unchanged for text layers.
  - `lib/studio/import-template.ts` — SVG→blocks importer establishing the
    managed-asset + editable-blocks + review-notice conventions.
  - `lib/content/document.ts` — the document schema (block union, geometry,
    shape `svgPath` vectors, page backgrounds, 40-block cap).
  - `components/content/content-editor-workspace.tsx` — `uploadTemplateRaster`,
    `installImportedPages`, `layoutPageForFreeCanvas` (geometry-bearing blocks
    pass through untouched), the raster review dialog, and
    `setStudioActionDialog` (the in-app confirm pattern; `window.confirm` is
    deliberately avoided by commit `95b830e`, which also hard-disabled the old
    file-import gate — Magic Layers therefore ships its own gated entry point
    rather than re-opening that path).

### Not verified (research sweep interrupted by provider rate limits)

A broader external sweep (SAM-family segmentation, LaMa/SD inpainting,
Tesseract.js/PaddleOCR, OmniParser, vector tracing) was launched but every
research agent died on API 429s before returning data. Those options are
therefore **UNVERIFIED** here and were NOT adopted. The architecture keeps
room for them (see §4): segmentation/OCR/inpainting providers would slot in
behind the same plan schema and pixel-ops interfaces.

### Deliberate P1 scope decisions

- **No new dependencies** (no `sharp`, no ONNX runtime, no OCR package). All
  pixel work runs client-side on canvas `ImageData` — the exact pattern the
  shipped raster-text erase already uses — and the only external service is
  the already-integrated Groq API.
- **No Python/GPU-dependent segmentation.** Image layers are rectangular
  cutouts, honestly labelled; edges include surrounding background when an
  element is moved. Alpha-matting is a future provider, not a claim.
- **The cleaned raster always stays the page background** (rather than
  synthesizing a native flat fill) so that anything the model failed to detect
  remains visible instead of being silently lost behind a fabricated colour.

## 3. Architecture

```
editor (AI drawer)                     server route                        pure libs
──────────────────                     ─────────────                       ─────────
file ≤2MB ────────── POST /magic-layers ──► auth/RBAC/status/magic-bytes
                                          Groq vision (3-key failover,
                                          request.signal cancellation)
                                          zod plan schema ──► validateMagicLayerPlan
                                          (caps, dedup, coverage gate) ──► JSON plan
review dialog ── user edits/selection
apply ─────────────────────────────────────────────────────────────────► verifySolidBackground
                                                                         verifySolidShapeFill
                                                                         eraseRasterTextPixels (existing)
                                                                         eraseRasterRegionPixels (new)
                                                                         cropRasterRegion (new)
   uploads: cleaned bg + cutouts (managed assets, 4 MB ceiling)
                                                                         buildMagicLayerPage
in-app confirm ──► installImportedPages (commit → undo history, unsaved)
```

Key invariants:

- **No duplicate foreground** — every selected element is erased from the
  background copy exactly once and cut out of the ORIGINAL pixels; layer
  geometry equals the source box, so the accepted composite matches the
  source until the user edits.
- **No fabricated content** — text comes back verbatim from the reviewed plan;
  shape claims that fail pixel verification become image cutouts; background
  colour claims are only reported, never substituted for the raster.
- **Confidence is visible and actionable** — elements below 0.5 confidence
  start unselected; every dropped/unsafe item is reported in the dialog.
- **Reversibility** — apply replaces the working canvas only after an explicit
  confirm; Undo (snapshot history, 80 entries) restores it; the source file
  and any saved versions are untouched.
- **Failure honesty** — provider unconfigured → 503; invalid model output →
  502 with actionable copy; client abort → analysis cancelled; oversized
  lossless output → the apply aborts with nothing changed.

## 4. Future provider slots (not built)

- Better segmentation (alpha matting) → replace `cropRasterRegion` output.
- Real inpainting (LaMa/SD) → replace `eraseRasterRegionPixels`.
- Dedicated OCR with word boxes → feed the same text-element schema.
- Vector tracing → feed the shape block's existing `svgPath` fields.

Each is isolated behind a small pure interface, so swapping providers never
touches the document model or the UI contract.

## 5. Evaluation

Measured on synthetic ground-truth rasters (built pixel-exactly in tests, so
truth is known) through the REAL pure pipeline — the same functions production
uses (`lib/studio/magic-layers.test.ts`):

- **Element completeness:** 3/3 recovered elements become blocks (perfect
  detection input); validator keeps 24-cap, dedups, sheds coverage overloads.
- **Geometry fidelity:** mapped block geometry equals the ground-truth mapping
  exactly (IoU 1.0 modulo documented 24 px clamps); aspect→preset mapping
  verified for square/story/portrait/landscapeSocial/a4/wide.
- **Stacking order:** painting order preserved into block order.
- **No duplicated foreground:** 0 residual badge-coloured pixels inside the
  erased region; 0 pixels changed outside reviewed boxes; cutouts still carry
  original content after the same region was erased in the copy.
- **Background reconstruction:** edge interpolation is EXACT (±2) for linear
  gradients and solid fills; refuses to invent pixels when no outside edge
  exists.
- **Dishonest-claim rejection:** non-flat "shapes" fail `verifySolidShapeFill`
  and downgrade to cutouts; wrong background colours fail border verification.
- **Text integrity:** recovered text is byte-identical to the reviewed plan.
- **Latency:** full pure pipeline (erase + validate + build on 1000×1000)
  runs in well under 2 s (asserted; typically tens of ms).
- **Route contract:** 12 tests cover auth, ownership, editable-status,
  magic-byte, plan normalization, key failover, invalid-JSON/schema failures,
  last-key propagation, and secret non-leakage.

**NOT measured (honest gaps):** live-model recognition quality (OCR accuracy,
box precision on real posters) — requires a configured `GROQ_API_KEY`, which
is absent from this environment; no key was invented. End-to-end browser flow
against a live backend — requires Supabase + auth + Groq (see §7).

## 6. Files

- `lib/studio/magic-layers.ts` — plan schema, validator, geometry mapping,
  pixel verification, page builder (pure; shared client/server).
- `lib/studio/raster-layers.ts` — region erase (edge interpolation) + crop.
- `app/api/brands/[brandId]/content/[contentId]/magic-layers/route.ts` — API.
- `components/content/content-editor-workspace.tsx` — AI drawer entry, review
  dialog, apply/confirm flow.
- Tests: `lib/studio/magic-layers.test.ts` (incl. synthetic evaluation),
  `lib/studio/raster-layers.test.ts`, `app/api/.../magic-layers/route.test.ts`.

## 7. Running it

```bash
npm install
npm run typecheck
npx vitest run
npm run build
npm run dev   # then: Studio editor → AI drawer → “Reconstruct layers from image”
```

Required for live reconstruction: `GROQ_API_KEY` (optionally `_2`, `_3`
failover slots) and `GROQ_VISION_MODEL` (defaults to `qwen/qwen3.8-27b`).
Without a key the route returns an honest 503 and the UI surfaces it; unit
and evaluation tests run fully offline.
