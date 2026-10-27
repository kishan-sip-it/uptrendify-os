export const meta = {
  name: 'template-design-overhaul',
  description: 'Raise visual quality + diversity of the 500-template catalogue, one agent per category file',
  phases: [
    { title: 'Design', detail: 'one agent per category catalogue file' },
    { title: 'Verify', detail: 'global audit + typecheck after all designers finish' },
  ],
}

const CATEGORIES = [
  { file: 'social', count: 110, prefix: 't-soc-', direction: 'Social & community. Breadth matters: typography-led quotes and statement posters (huge display type, minimal chrome), playful bold listicles, warm community prompts, punchy story promos. Social templates should feel fast, native to a feed, expressive — not like documents. Vary the mood across the file: at least one premium-dark sequence, one bright pop sequence, one calm pastel sequence.' },
  { file: 'marketing', count: 70, prefix: 't-mkt-', direction: 'Marketing & ads. Bright, confident launch and advertising creative: strong offer emphasis (discount bursts, price chips), urgent countdowns, promotional banners with real composition. Ads should demand attention — bold accent fields, big numerals. Mix in at least one premium dark sequence and one clean corporate light sequence.' },
  { file: 'brand', count: 50, prefix: 't-brd-', direction: 'Brand & business identity. Refined minimal and monochrome editorial layouts, elegant letterheads and media kits. Whitespace is the luxury signal here: restrained accents, precise rules, serif display for premium clients. A few deeper-tone boards (noirgold, midnight) for premium brands are welcome — but no nightclub energy.' },
  { file: 'ecommerce', count: 60, prefix: 't-eco-', direction: 'E-commerce & product. Product-forward layouts: strong photo-placeholder frames, prominent price typography, clear CTA hierarchy. Sale/offer templates get high-energy palettes (coral, sunset, wine); catalogue and showcase pages get calm editorial palettes (cream, sand, ivory). Prices should never whisper.' },
  { file: 'presentation', count: 45, prefix: 't-pre-', direction: 'Presentations & pitch decks. Data-forward, boardroom-grade. Big stat numerals, clean dividers, restrained palettes (steel, paperblue, mono, midnight). At least 8 slides should use premium dark backgrounds (midnight/noirgold/neon handled carefully). Titles big, body text quiet.' },
  { file: 'events', count: 40, prefix: 't-evt-', direction: 'Events & launches. Expressive and occasion-driven: bold festival/poster energy for public events (coral, plum, sunset, neon), elegant refined invitations for galas and recitals (noirgold, wine, forest with display serif fonts). Dates and locations must always be prominent.' },
  { file: 'education', count: 35, prefix: 't-edu-', direction: 'Education & learning. Friendly but structured: clear lesson hierarchy, numbered structure, calm palettes (arctic, mint, paperblue) with a few warm playful ones (blush, sunset) for younger audiences. Worksheets stay ink-on-paper minimal. Big friendly display headings, generous spacing.' },
  { file: 'editorial', count: 35, prefix: 't-edt-', direction: 'Editorial & content. Magazine-style compositions: mastheads, cover lines, pull quotes with display serif type, editorial covers with coverLines. Palettes: wine, noirgold, midnight, mono, cream. Blog headers get cleaner web-magazine treatment. Type contrast (serif display over quiet sans body) is the signature.' },
  { file: 'infographic', count: 25, prefix: 't-inf-', direction: 'Infographics & data visualization. Data-forward: bar lengths and stat numerals are the heroes — make numbers huge (fs 80-110+), labels quiet. Palettes: steel, royal, paperblue, midnight, forest. Process/cycle diagrams get accent nodes. Every chart element should feel deliberate, not decorative.' },
  { file: 'documents', count: 30, prefix: 't-doc-', direction: 'Documents, proposals & career. Elegant, restrained, professional: strong name/section typography, precise rules, sidebar or accent-bar layouts, sand/steel/forest/mono/paperblue palettes. Resumes get clear section hierarchy. A proposal should read like it costs money — never like a flyer.' },
]

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    templatesChanged: { type: 'number' },
    palettesUsed: { type: 'number' },
    designDirections: { type: 'string', description: '2-4 sentences on the concrete visual directions applied' },
    auditStatus: { type: 'string', description: 'result of running the audit scoped to your prefix' },
    notes: { type: 'string' },
  },
  required: ['file', 'templatesChanged', 'palettesUsed', 'designDirections', 'auditStatus'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    auditPassed: { type: 'boolean' },
    typecheckPassed: { type: 'boolean' },
    collisions: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['auditPassed', 'typecheckPassed', 'notes'],
}

const COMMON = `You are upgrading the visual design quality of UpTrendifyOS Studio's template catalogue. Repo: /home/groovy/uptrendify-os, branch feat/studio-template-library-500-20261023 already checked out. Work from that directory.

READ FIRST (do not edit any of these): lib/studio/template-library/types.ts (spec shapes), lib/studio/template-library/archetypes.ts (the composer option surface — use it fully), lib/studio/template-library/art.ts (the ONLY 24 palettes available, by name), lib/studio/template-library/catalog/social.ts (reference quality bar), and your own catalogue file.

EDIT EXACTLY ONE FILE: your assigned catalogue file. Never touch archetypes.ts, art.ts, types.ts, build.ts, audit.test.ts, or any other catalogue file — other agents are editing those in parallel.

HARD RULES (the automated audit enforces these):
- Keep the template count EXACTLY as-is; keep every id, name, category, subcategory and tags set (you may sharpen copy wording, but keep meaning and search terms).
- Keep each template's format unless a different format genuinely serves the use case better (format changes alter geometry, so they help uniqueness).
- The audit enforces WCAG contrast: normal text 4.5:1, large text (>=24px or >=19px bold) 3:1, computed against backing shapes. The builder auto-picks readable accent variants (accentText) and readable button label colors (onAccent) — but do not rely on it for everything: prefer dark ink on light surfaces and white/dark-on-accent fills that obviously read.
- Structural uniqueness (fingerprints over geometry+roles+text-length buckets) must stay unique: if your changes collide two templates, vary composition options, element counts, or format until they differ.
- The audit also rejects: text elements with opacity < 0.35, pages with a flat type scale (max-min font diff < 6px across >=2 sized text blocks — give every page a real hierarchy), off-canvas geometry.

DESIGN BAR (this is a client-facing quality pass — the previous catalogue looked washed-out and samey):
- Palette diversity: use AT LEAST 8 distinct palettes across your file, matched to the design direction below. Do not default everything to mono/steel.
- Composition diversity: use the full option surface of the composers (decor variants, layout splits, alignments, count knobs, font keys). Two templates in your file should not read as siblings.
- Hierarchy: every page needs a dominant element — a display-scale heading (fontSize 40+ on square/portrait, 60+ on wide), a strong accent panel or chip, and quiet supporting text. Use the font keys ('display' serif for premium/editorial, 'geometric' for bold/modern, 'humanist' for warm/friendly).
- Use page gradients (gradient: { from, to, angle } on a page) where the mood calls for it — deep gradient pages for premium/dark designs, soft tints for calm ones. Maybe 10-25% of your file, not more.
- Opacity on text: never below 0.6 (audit floor is 0.35, but 0.6+ is the design bar).

VERIFICATION LOOP (run from repo root):
1. npx vitest run lib/studio/template-library/audit.test.ts
   - Gate on YOUR templates only (prefix ${''}matches your ids). Failures reported for other agents' prefixes are expected mid-flight — ignore them, do not fix other files.
2. npx tsc --noEmit — must be clean for YOUR file (again, ignore transient errors in files others are editing; retry once after 60s if unsure).
Iterate until your prefix is clean. Return the structured summary.`

phase('Design')
const results = await parallel(CATEGORIES.map((c) => () =>
  agent(
    `${COMMON}\n\nYOUR ASSIGNMENT:\n- File: lib/studio/template-library/catalog/${c.file}.ts\n- Prefix: ${c.prefix}\n- Template count to preserve: exactly ${c.count}\n- Design direction: ${c.direction}`,
    { label: `design:${c.file}`, phase: 'Design', schema: DESIGN_SCHEMA },
  ),
))

phase('Verify')
const designed = results.filter(Boolean)
log(`${designed.length}/10 designers completed; running global verification`)
const verdict = await agent(
  `Repo /home/groovy/uptrendify-os, branch feat/studio-template-library-500-20261023. Ten parallel agents just upgraded template catalogue files under lib/studio/template-library/catalog/. Run the full quality gate now:
1. npx vitest run lib/studio/template-library/audit.test.ts — must be all green (it enforces exactly 500 templates, exact category counts 110/70/50/60/45/40/35/35/25/30, unique ids/names, schema-valid builds, WCAG contrast, fingerprint uniqueness, hierarchy).
2. npx tsc --noEmit — must be clean.
If either fails: diagnose the failing catalogue file(s), fix the MINIMAL issue (e.g. a fingerprint collision between two templates — vary one template's composition options or format; a type error in one file). Do not redesign, do not touch shared files (archetypes/art/types/build). Re-run until green or report precisely what cannot be fixed.
Return the verdict.`,
  { label: 'verify:global', phase: 'Verify', schema: VERDICT_SCHEMA, effort: 'high' },
)

return { designed, verdict }