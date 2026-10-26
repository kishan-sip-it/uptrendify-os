import type { ContentPageSizeId } from '@/lib/content/document';
import { ARCHETYPES, type ArchetypeArgs, type ArchetypeId, type CopyBag } from '../archetypes';
import type { TemplateCategoryId, TemplateDefinition, TemplatePageSpec } from '../types';

/** Compact authoring shape for one page of a catalogue entry. */
export type CatalogPage<P = Record<string, unknown>> = {
  archetype: ArchetypeId;
  size: ContentPageSizeId;
  copy: CopyBag;
  options?: P;
  bg?: string;
  gradient?: { from: string; to: string; angle: number };
};

/**
 * Assemble a catalogue definition. Pages are rendered by their archetype at
 * author time, so every definition in the source tree is a real, inspectable
 * TemplateDefinition.
 */
export function def(input: {
  id: string;
  name: string;
  category: TemplateCategoryId;
  subcategory: string;
  format: ContentPageSizeId;
  style: string;
  useCase: string;
  audience: string;
  tags: string[];
  palette: string;
  pages: Array<CatalogPage>;
}): TemplateDefinition {
  return {
    ...input,
    pages: input.pages.map((page): TemplatePageSpec => {
      const composer = ARCHETYPES[page.archetype] as (args: ArchetypeArgs<Record<string, unknown>>) => TemplatePageSpec;
      const composed = composer({ size: page.size, copy: page.copy, options: page.options });
      let spec = page.bg ? { ...composed, bg: page.bg } : composed;
      if (page.gradient) spec = { ...spec, gradient: page.gradient };
      return spec;
    }),
  };
}
