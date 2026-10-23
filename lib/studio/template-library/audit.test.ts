import { describe, expect, it } from 'vitest';
import { CONTENT_PAGE_SIZES, contentDocumentSchema } from '@/lib/content/document';
import { buildTemplateDocument, templateFingerprints } from './build';
import { templatePaletteByName, TEMPLATE_PALETTES } from './art';
import { STUDIO_LIBRARY, TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_COUNTS, TEMPLATE_TOTAL, libraryCountByCategory } from './index';
import { templateSearchBlob } from './types';

/** Catalogue-wide quality gates. These run against every template on every test run. */

const idCounts = new Map<string, number>();
const nameCounts = new Map<string, number>();
for (const template of STUDIO_LIBRARY) {
  idCounts.set(template.id, (idCounts.get(template.id) ?? 0) + 1);
  nameCounts.set(template.name, (nameCounts.get(template.name) ?? 0) + 1);
}

describe('catalogue integrity', () => {
  it('contains exactly 500 templates', () => {
    expect(STUDIO_LIBRARY).toHaveLength(TEMPLATE_TOTAL);
    expect(STUDIO_LIBRARY).toHaveLength(500);
  });

  it('matches the required per-category counts exactly', () => {
    const counts = libraryCountByCategory();
    for (const category of TEMPLATE_CATEGORIES) {
      expect(counts[category.id], category.id).toBe(TEMPLATE_CATEGORY_COUNTS[category.id]);
    }
  });

  it('has no duplicate ids or names', () => {
    const dupIds = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
    const dupNames = [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    expect(dupIds).toEqual([]);
    expect(dupNames).toEqual([]);
  });

  it('has complete, meaningful metadata on every template', () => {
    const problems: string[] = [];
    for (const template of STUDIO_LIBRARY) {
      if (template.name.length < 4) problems.push(`${template.id}: name too short`);
      if (!template.subcategory) problems.push(`${template.id}: missing subcategory`);
      if (!TEMPLATE_PALETTES[template.palette ?? 'mono']) problems.push(`${template.id}: unknown palette ${template.palette}`);
      if (template.useCase.length < 12) problems.push(`${template.id}: useCase too thin`);
      if (template.audience.length < 4) problems.push(`${template.id}: audience too thin`);
      if (template.tags.length < 3) problems.push(`${template.id}: needs 3+ tags`);
      if (template.style.length < 3) problems.push(`${template.id}: style too thin`);
      if (template.pages.length < 1 || template.pages.length > 10) problems.push(`${template.id}: page count ${template.pages.length}`);
      for (const tag of template.tags) if (!tag.trim()) problems.push(`${template.id}: empty tag`);
    }
    expect(problems).toEqual([]);
  });

  it('every template builds a schema-valid, content-rich document', () => {
    const problems: string[] = [];
    for (const template of STUDIO_LIBRARY) {
      let doc;
      try {
        doc = buildTemplateDocument(template, templatePaletteByName(template.palette ?? 'mono'));
      } catch (error) {
        problems.push(`${template.id}: build threw ${(error as Error).message}`);
        continue;
      }
      const parsed = contentDocumentSchema.safeParse(doc);
      if (!parsed.success) {
        problems.push(`${template.id}: schema invalid — ${parsed.error.issues[0]?.message} at ${parsed.error.issues[0]?.path.join('.')}`);
        continue;
      }
      doc.pages.forEach((page, pageIndex) => {
        if (page.blocks.length === 0) problems.push(`${template.id}: page ${pageIndex} is empty`);
        if (page.blocks.length > 40) problems.push(`${template.id}: page ${pageIndex} exceeds 40 blocks`);
        const textBlocks = page.blocks.filter((block) => (block.type === 'heading' || block.type === 'text') && block.text.trim());
        if (textBlocks.length === 0) problems.push(`${template.id}: page ${pageIndex} has no readable text`);
        for (const block of page.blocks) {
          if ((block.type === 'heading' || block.type === 'text') && /lorem|ipsum|todo|xxx|placeholder copy/i.test(block.text)) {
            problems.push(`${template.id}: placeholder copy detected — "${block.text.slice(0, 40)}"`);
          }
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it('keeps geometry on the canvas (with bleed tolerance) on every page', () => {
    const problems: string[] = [];
    for (const template of STUDIO_LIBRARY) {
      for (const page of template.pages) {
        const dims = CONTENT_PAGE_SIZES[page.size];
        const bleed = Math.max(dims.width, dims.height) * 0.25;
        for (const block of page.blocks) {
          const label = `${template.id} [${block.kind}]`;
          if (block.x < -bleed) problems.push(`${label} bleeds too far left (${block.x})`);
          if (block.y < -bleed) problems.push(`${label} bleeds too far up (${block.y})`);
          if (block.x + block.w > dims.width + bleed) problems.push(`${label} bleeds too far right`);
          if (block.y + block.h > dims.height + bleed) problems.push(`${label} bleeds too far down`);
          const overlap = block.x < dims.width && block.y < dims.height && block.x + block.w > 0 && block.y + block.h > 0;
          if (!overlap) problems.push(`${label} sits entirely off the page`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('has no structurally identical compositions (fingerprint uniqueness)', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const template of STUDIO_LIBRARY) {
      const fingerprint = templateFingerprints(template).join('||');
      const owner = seen.get(fingerprint);
      if (owner) duplicates.push(`${template.id} duplicates ${owner}`);
      else seen.set(fingerprint, template.id);
    }
    expect(duplicates).toEqual([]);
  });

  it('is searchable: every template matches its own name', () => {
    const misses: string[] = [];
    for (const template of STUDIO_LIBRARY) {
      const blob = templateSearchBlob(template);
      const words = template.name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
      if (!words.every((word) => blob.includes(word))) misses.push(template.id);
    }
    expect(misses).toEqual([]);
  });

  it('is accent-independent: structure holds under any brand colour', () => {
    const problems: string[] = [];
    const structureOf = (template: (typeof STUDIO_LIBRARY)[number]) => {
      const doc = buildTemplateDocument(template, templatePaletteByName(template.palette ?? 'mono'), '#abcdef');
      return JSON.stringify(doc.pages.map((page) => page.blocks.map((block) => [block.id, block.geometry])));
    };
    for (const template of STUDIO_LIBRARY) {
      const a = buildTemplateDocument(template, templatePaletteByName(template.palette ?? 'mono'), '#123456');
      const b = buildTemplateDocument(template, templatePaletteByName(template.palette ?? 'mono'), '#abcdef');
      if (JSON.stringify(a.pages.map((page) => page.blocks.map((block) => [block.id, block.geometry]))) !== JSON.stringify(b.pages.map((page) => page.blocks.map((block) => [block.id, block.geometry])))) {
        problems.push(template.id);
      }
      expect(structureOf(template)).toBeTruthy();
    }
    expect(problems).toEqual([]);
  });
});
