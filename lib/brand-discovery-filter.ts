import type { BrandWebsiteCandidate } from '@/lib/brand-discovery';

const LOW_TRUST_HOST_PATTERN = /\.(?:freehostdev|000webhostapp|wixsite|weebly|webnode|jimdosite|godaddysites|blogspot|wordpress)(?:\.|$)/i;

export function filterBrandDiscoveryCandidates(candidates: BrandWebsiteCandidate[]): BrandWebsiteCandidate[] {
  return candidates.filter((candidate) => {
    const host = candidate.host.toLowerCase().replace(/^www\./, '');
    return !LOW_TRUST_HOST_PATTERN.test(host);
  });
}
