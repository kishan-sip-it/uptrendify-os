import { describe, expect, it } from 'vitest';
import { filterBrandDiscoveryCandidates } from './brand-discovery-filter';

describe('filterBrandDiscoveryCandidates', () => {
  it('removes free-hosting aliases that can masquerade as official domains', () => {
    const result = filterBrandDiscoveryCandidates([
      { title: 'Samaaroh', url: 'https://samaaroh.freehostdev', host: 'samaaroh.freehostdev', iconUrl: null },
      { title: 'Samaaroh Technologies', url: 'https://www.samaaroh.co.in', host: 'www.samaaroh.co.in', iconUrl: null },
    ]);
    expect(result.map((candidate) => candidate.host)).toEqual(['www.samaaroh.co.in']);
  });
});
