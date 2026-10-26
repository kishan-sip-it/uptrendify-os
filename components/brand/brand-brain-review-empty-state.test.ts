import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(new URL('./brand-brain-review.tsx', import.meta.url), 'utf8');

describe('BrandBrainReview empty-filter state', () => {
  it('uses one empty-state rendering path when the selected filter has no results', () => {
    // This component suite runs in the Node environment without a DOM renderer.
    // Guard the exact regression: a second fallback EmptyState was rendered after
    // the dedicated grouped.size === 0 EmptyState, producing duplicate cards.
    expect(componentSource.match(/'No suggestions in this view'/g) ?? []).toHaveLength(1);
    expect(componentSource).not.toContain(
      'description="Change the review filter to inspect another part of the Brand Brain."',
    );
  });
});
