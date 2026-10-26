/**
 * Generates docs/studio-template-library/CATALOG.md from the live library.
 * Run: npx esbuild scripts/generate-template-catalog.ts --bundle --platform=node \
 *        --format=esm --outfile=/tmp/gen-catalog.mjs --external:vitest && node /tmp/gen-catalog.mjs \
 *      > docs/studio-template-library/CATALOG.md
 */
import { STUDIO_LIBRARY, TEMPLATE_CATEGORIES } from '../lib/studio/template-library/index';
import { CONTENT_PAGE_SIZES } from '../lib/content/document';

const lines: string[] = [];
lines.push('# Template Catalog — 500 curated templates');
lines.push('');
lines.push(`Generated from \`STUDIO_LIBRARY\` (${new Date().toISOString().slice(0, 10)}) by \`scripts/generate-template-catalog.ts\`. Re-run the command in the header to regenerate.`);
lines.push('');
lines.push('| Category | Count |');
lines.push('|---|---:|');
for (const category of TEMPLATE_CATEGORIES) {
  lines.push(`| ${category.label} (${category.id}) | ${STUDIO_LIBRARY.filter((t) => t.category === category.id).length} |`);
}
lines.push(`| **Total** | **${STUDIO_LIBRARY.length}** |`);
lines.push('');
lines.push('| ID | Name | Category | Subcategory | Format | Style | Use case | Elements/pages |');
lines.push('|---|---|---|---|---|---|---|---|');
for (const t of STUDIO_LIBRARY) {
  const format = CONTENT_PAGE_SIZES[t.format].label.split('·')[0]?.trim() ?? t.format;
  const blocks = t.pages.reduce((sum, page) => sum + page.blocks.length, 0);
  lines.push(`| ${t.id} | ${t.name} | ${t.category} | ${t.subcategory} | ${format} | ${t.style} | ${t.useCase} | ${blocks}/${t.pages.length} |`);
}
process.stdout.write(lines.join('\n') + '\n');
