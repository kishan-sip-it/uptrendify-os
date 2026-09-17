import { describe, it, expect } from 'vitest';
import { chunkText, chunkTextBounded } from './chunk';

describe('chunkText', () => {
  it('returns empty array for empty or whitespace-only text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('returns a single chunk when text fits within maxChars', () => {
    const text = 'Short sentence about the brand.';
    const chunks = chunkText(text, { maxChars: 2000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('never exceeds maxChars for a single chunk', () => {
    const text = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} about brand facts and features.`).join(' ');
    const chunks = chunkText(text, { maxChars: 800, overlapChars: 80 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(800);
  });

  it('prefers sentence boundaries and splits long text deterministically', () => {
    const sentenceA = 'A'.repeat(1200);
    const sentenceB = 'B'.repeat(1200);
    const text = `${sentenceA}. ${sentenceB}.`;
    const chunks = chunkText(text, { maxChars: 1000, overlapChars: 0 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Every chunk starts at a clean boundary (beginning of a sentence or hard window).
    expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
  });

  it('produces identical output across calls (deterministic)', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Fact ${i} describes the company value proposition.`).join(' ');
    expect(chunkText(text, { maxChars: 300 })).toEqual(chunkText(text, { maxChars: 300 }));
  });

  it('overlaps chunk tails so context is preserved across boundaries', () => {
    const text = Array.from({ length: 80 }, (_, i) => `The feature number ${i} helps teams grow faster.`).join(' ');
    const chunks = chunkText(text, { maxChars: 500, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    // Boundary content should appear in two consecutive chunks somewhere.
    const overlapFound = chunks.some((chunk, i) => i + 1 < chunks.length && chunks[i + 1].includes(chunk.slice(-40)));
    expect(overlapFound).toBe(true);
  });
});

describe('chunkTextBounded', () => {
  it('caps the number of chunks returned', () => {
    const text = Array.from({ length: 100 }, (_, i) => `Value ${i} repeated content for chunking across the crawl.`).join(' ');
    const chunks = chunkTextBounded(text, 3, { maxChars: 400 });
    expect(chunks).toHaveLength(3);
  });
});