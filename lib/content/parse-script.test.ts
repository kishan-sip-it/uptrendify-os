import { describe, expect, it } from 'vitest';
import { estimateSeconds, storyboardPagesFromScript } from './parse-script';

describe('video script storyboard projection', () => {
  it('is deterministic and keeps script copy editable on page blocks', () => {
    const script = 'Scene 1\nOpen with the problem.\n\nScene 2\nShow the product.';
    const first = storyboardPagesFromScript(script, 'story');
    expect(first).toEqual(storyboardPagesFromScript(script, 'story'));
    expect(first).toHaveLength(2);
    const allText = first.flatMap((page) => page.blocks.map((block) => 'text' in block ? block.text : '')).join('\n');
    expect(allText).toContain('Open with the problem.');
    expect(allText).toContain('Show the product.');
  });

  it('estimates speech at roughly 150 words per minute', () => {
    expect(estimateSeconds('one two three four five')).toBe(2);
    expect(estimateSeconds('')).toBe(0);
  });
});
