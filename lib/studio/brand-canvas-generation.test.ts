import { describe, expect, it } from 'vitest';
import { contentDocumentSchema } from '@/lib/content/document';
import { contrastRatio, mixOver, relativeLuminance } from '@/lib/studio/template-library/contrast';
import type { BrandEssentials } from '@/lib/studio/apply-brand-essentials';
import {
  brandEssentialsPalette,
  briefSeedInt,
  generateBrandCanvas,
  readableOn,
  type BrandCanvasBrief,
} from './brand-canvas-generation';

const essentials: BrandEssentials = {
  colors: ['#0f766e', '#f59e0b', '#e2e8f0'],
  accent: '#0f766e',
  secondary: '#f59e0b',
  ink: '#0f2137',
  surface: '#f4f7f6',
  headingFont: 'Poppins',
  bodyFont: 'Inter',
  logoUrl: 'https://brand.example/logo.png',
};

const brief: BrandCanvasBrief = {
  brandName: 'Stillwater Studio',
  title: 'Find your calm this season',
  cta: 'Book a class',
  contentType: 'social_post',
  channel: 'instagram',
  industry: 'Wellness',
  audience: 'Busy professionals',
  valueProposition: 'Yoga that fits between meetings',
  messagingThemes: ['Small daily pauses', 'Strength through softness'],
  callsToAction: ['Join tonight’s class'],
  painPoints: ['Back tension from desk work'],
  useCases: ['Lunch resets', 'Evening wind-down', 'Weekend strength'],
  seed: 'content-1234',
};

describe('briefSeedInt', () => {
  it('is deterministic and stays inside the modulo', () => {
    for (let modulo = 1; modulo <= 5; modulo += 1) {
      const first = briefSeedInt(brief.seed, modulo);
      expect(briefSeedInt(brief.seed, modulo)).toBe(first);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThan(modulo);
    }
  });
});

describe('brandEssentialsPalette', () => {
  it('keeps text readable over the derived paper', () => {
    const palette = brandEssentialsPalette(essentials);
    expect(contrastRatio(palette.ink, palette.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(4.5);
    expect(palette.accent).toBe(essentials.accent);
  });

  it('falls back safely with an empty scan', () => {
    const palette = brandEssentialsPalette({
      colors: [], accent: null, secondary: null, ink: '#1d2634', surface: null,
      headingFont: null, bodyFont: null, logoUrl: null,
    });
    expect(contrastRatio(palette.ink, palette.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('derives the soft tint from the accent', () => {
    const palette = brandEssentialsPalette(essentials);
    expect(palette.soft).toBe(mixOver(essentials.accent ?? '#0f766e', '#ffffff', 0.86));
  });
});

describe('readableOn', () => {
  it('picks a passing colour over dark and light fills', () => {
    const dark = readableOn('#101322', '#e2e8f0', '#ffffff');
    const light = readableOn('#f5f5f0', '#1d2634', '#ffffff');
    expect(contrastRatio(dark, '#101322')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light, '#f5f5f0')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('generateBrandCanvas', () => {
  it('produces one schema-valid page at the channel default size', () => {
    const pages = generateBrandCanvas(brief, essentials);
    expect(pages).toHaveLength(1);
    expect(() => contentDocumentSchema.parse({ kind: 'uptrendify-doc', version: 1, mode: 'free', pages })).not.toThrow();
    expect(pages[0]!.size).toBe('portrait');
    expect(pages[0]!.blocks.length).toBeGreaterThan(2);
  });

  it('is byte-identical for the same brief', () => {
    expect(JSON.stringify(generateBrandCanvas(brief, essentials)))
      .toBe(JSON.stringify(generateBrandCanvas(brief, essentials)));
  });

  it('carries the brief copy and brand footer onto the page', () => {
    const texts = generateBrandCanvas(brief, essentials)[0]!.blocks
      .map((block) => ('text' in block ? block.text ?? '' : ''))
      .join('\n');
    expect(texts).toContain('Find your calm this season');
    expect(texts).toContain('Stillwater Studio');
  });

  it('varies the layout across seeds while staying on-brand', () => {
    const variants = new Set<string>();
    for (let index = 0; index < 8; index += 1) {
      const pages = generateBrandCanvas({ ...brief, seed: `seed-${index}` }, essentials);
      variants.add(pages[0]!.blocks.map((block) => block.type + ('text' in block ? `:${(block.text ?? '').slice(0, 18)}` : '')).join('|'));
      expect(() => contentDocumentSchema.parse({ kind: 'uptrendify-doc', version: 1, mode: 'free', pages })).not.toThrow();
    }
    expect(variants.size).toBeGreaterThan(1);
  });

  it('uses the dark gradient for story formats and keeps contrast on shapes', () => {
    const pages = generateBrandCanvas({ ...brief, contentType: 'video_script', channel: 'tiktok' }, essentials);
    expect(pages[0]!.gradient).toBeDefined();
    const midpoint = relativeLuminance(mixOver(pages[0]!.gradient!.from, pages[0]!.gradient!.to, 0.5));
    expect(midpoint).toBeLessThan(0.4);
  });

  it('survives a nearly empty brief', () => {
    const pages = generateBrandCanvas({
      brandName: '', title: '', cta: null, contentType: null, channel: null, seed: 'blank',
    }, essentials);
    expect(() => contentDocumentSchema.parse({ kind: 'uptrendify-doc', version: 1, mode: 'free', pages })).not.toThrow();
  });
});
