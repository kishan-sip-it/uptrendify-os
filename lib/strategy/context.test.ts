import { describe, it, expect } from 'vitest';
import {
  buildStrategyTextContext,
  summarizeSnapshot,
  STRATEGY_FACTS_MAX,
  STRATEGY_INSIGHTS_MAX,
} from './context';

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    brand: { name: 'Aurora', websiteUrl: 'https://aurora.dev', industry: 'B2B SaaS', marketCountry: 'US', targetAudience: 'Growth teams' },
    facts: [
      { key: 'identity', value: { brandName: 'Aurora', industry: 'B2B SaaS' } },
      { key: 'positioning', value: { valueProposition: 'Evidence-first marketing' } },
    ],
    insights: [
      { category: 'POSITIONING', title: 'Differentiator', description: 'Evidence-first workflow', priority: 1 },
      { category: 'EVIDENCE', title: 'Claim', description: 'Aurora states it serves 200 teams', priority: 3 },
    ],
    evidenceClaims: [{ claim: 'Aurora states it serves 200 teams', sourceUrl: 'https://aurora.dev/about' }],
    sources: [{ url: 'https://aurora.dev/', title: 'Aurora Home' }],
    researchRunId: '00000000-0000-4000-8000-000000000005',
    ...overrides,
  };
}

describe('buildStrategyTextContext', () => {
  it('includes brand profile, facts, insights, evidence claims and sources', () => {
    const text = buildStrategyTextContext(snapshot() as never);
    expect(text).toContain('## BRAND PROFILE');
    expect(text).toContain('Name: Aurora');
    expect(text).toContain('Industry: B2B SaaS');
    expect(text).toContain('## VERIFIED BRAND FACTS');
    expect(text).toContain('### identity');
    expect(text).toContain('## BRAND INSIGHTS');
    expect(text).toContain('[P1] POSITIONING: Differentiator');
    expect(text).toContain('## EVIDENCE CLAIMS');
    expect(text).toContain('Aurora states it serves 200 teams (source: https://aurora.dev/about)');
    expect(text).toContain('## RESEARCH SOURCES');
    expect(text).toContain('https://aurora.dev/ — Aurora Home');
  });

  it('caps the number of facts, insights and sources included', () => {
    const many = snapshot({
      facts: Array.from({ length: 30 }, (_, i) => ({ key: `key-${i}`, value: `v${i}` })),
      insights: Array.from({ length: 120 }, (_, i) => ({ category: 'SEO', title: `insight ${i}`, description: null, priority: 3 })),
      evidenceClaims: Array.from({ length: 100 }, (_, i) => ({ claim: `claim ${i}`, sourceUrl: null })),
      sources: Array.from({ length: 40 }, (_, i) => ({ url: `https://example.com/${i}`, title: `s${i}` })),
    });
    const text = buildStrategyTextContext(many as never);
    expect((text.match(/^### /gm) ?? []).length).toBeLessThanOrEqual(STRATEGY_FACTS_MAX + 1);
    expect((text.match(/^- \[P0?3\] /gm) ?? []).length).toBeLessThanOrEqual(STRATEGY_INSIGHTS_MAX);
    expect((text.match(/^## EVIDENCE CLAIMS/m) ? (text.split('## EVIDENCE CLAIMS')[1]?.match(/^- /g) ?? []).length : 0)).toBeLessThanOrEqual(60);
    expect((text.match(/^## RESEARCH SOURCES/m) ? (text.split('## RESEARCH SOURCES')[1]?.match(/^- /g) ?? []).length : 0)).toBeLessThanOrEqual(10);
  });

  it('truncates long fact values', () => {
    const text = buildStrategyTextContext(snapshot({ facts: [{ key: 'identity', value: 'x'.repeat(5000) }] }) as never);
    const value = text.split('### identity')[1] ?? '';
    expect(value.length).toBeLessThan(2000);
  });
});

describe('summarizeSnapshot', () => {
  it('reports counts and brand metadata for the persisted input snapshot', () => {
    const summary = summarizeSnapshot(snapshot() as never);
    expect(summary).toEqual({
      researchRunId: '00000000-0000-4000-8000-000000000005',
      brand: { name: 'Aurora', websiteUrl: 'https://aurora.dev', industry: 'B2B SaaS', marketCountry: 'US', targetAudience: 'Growth teams' },
      facts: 2,
      insights: 2,
      evidenceClaims: 1,
      sources: 1,
    });
  });
});