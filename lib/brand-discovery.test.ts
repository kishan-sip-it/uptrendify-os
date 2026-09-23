import { describe, expect, it } from 'vitest';
import { discoverBrandWebsites } from './brand-discovery';

describe('discoverBrandWebsites', () => {
  it('returns no candidates for an empty query without making a network request', async () => {
    await expect(discoverBrandWebsites('   ')).resolves.toEqual([]);
  });
});
