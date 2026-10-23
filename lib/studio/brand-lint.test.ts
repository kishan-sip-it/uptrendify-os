import { describe, expect, it } from 'vitest';
import { channelLimit, healthScore, lintBlocks } from './brand-lint';
import type { ContentDocBlock } from '@/lib/content/document';

describe('Studio brand lint', () => {
  it('suggests a configured brand colour without mutating source blocks', () => {
    const blocks: ContentDocBlock[] = [{ id: 'heading-1', type: 'heading', text: 'Launch', level: 1, align: 'left', color: '#ff0000', bg: null, bold: true, italic: false, underline: false }];
    const issues = lintBlocks(blocks, { colors: ['#112233', '#445566'] });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.patch).toEqual({ color: '#112233' });
    expect(blocks[0]?.type === 'heading' && blocks[0].color).toBe('#ff0000');
  });

  it('bounds the score and recognizes common channels', () => {
    expect(healthScore([], 4)).toBe(100);
    expect(healthScore([{ blockId: 'x', kind: 'test', message: 'test', patch: {} }], 1)).toBe(70);
    expect(healthScore([], 0)).toBe(100);
    expect(channelLimit('Instagram')).toBe(2200);
    expect(channelLimit('LinkedIn')).toBe(3000);
    expect(channelLimit('unknown')).toBeNull();
  });
});
