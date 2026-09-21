import { describe, it, expect, vi } from 'vitest';
import { AiProviderError } from './types';
import {
  BrandIntelligenceValidationError,
  buildBrandIntelligencePrompt,
  buildEvidenceContext,
  extractBrandIntelligence,
  parseBrandIntelligence,
  sanitizeEvidence,
  type EvidenceFragment,
} from './brand-intelligence';

function fakeProvider(outputs: Array<string | Error>, model = 'fake-model') {
  const calls: Array<{ prompt: string; maxTokens?: number; json?: boolean }> = [];
  const provider = {
    id: 'fake',
    defaultModel: model,
    configured: () => true,
    health: async () => ({ id: 'fake', configured: true, ok: true }),
    generate: vi.fn(async (input: { prompt: string; json?: boolean; maxTokens?: number }) => {
      calls.push({ prompt: input.prompt, json: input.json, maxTokens: input.maxTokens });
      const output = outputs.shift();
      if (output instanceof Error) throw output;
      return { text: output ?? '{}', model };
    }),
    __calls: calls,
  };
  return provider;
}

const VALID_INTELLIGENCE = JSON.stringify({
  identity: {
    brandName: 'Aurora',
    companyDescription: 'A B2B SaaS company.',
    industry: 'B2B SaaS',
    businessModel: 'Subscription',
    primaryMarket: 'Enterprise',
    geography: 'United States',
    productCategories: ['Analytics'],
  },
  audience: { targetAudience: 'Ops leaders', buyerPersonas: [], customerTypes: [], painPoints: ['Slow reports'], useCases: [] },
  positioning: { valueProposition: 'Faster insights', differentiators: ['Real-time dashboards'], positioningThemes: [], brandMessaging: null },
  offer: { productsAndServices: ['Aurora Analytics'], keyFeatures: [], benefits: [], pricingSignals: [], callsToAction: [] },
  messaging: { recurringClaims: [], toneOfVoice: [], terminology: [], messagingThemes: [] },
  seo: { importantTopics: [], keywordThemes: [], contentGaps: [], searchIntentOpportunities: [] },
  competition: { namedCompetitors: [], alternatives: [], differentiationClaims: [] },
  evidence: [{ claim: 'Aurora is a B2B SaaS company.', sourceUrl: 'https://example.com/' }],
});

const fragments: EvidenceFragment[] = [{ url: 'https://example.com/', title: 'Aurora', text: 'Aurora sells real-time analytics for operations teams.' }];

describe('buildEvidenceContext', () => {
  it('skips empty sources and caps total characters', () => {
    const ctx = buildEvidenceContext([
      { url: 'https://a.example/', text: '' },
      { url: 'https://b.example/', text: 'x'.repeat(9000) },
      { url: 'https://c.example/', text: 'y'.repeat(9000) },
    ]);
    expect(ctx.length).toBe(2);
    expect(ctx[0].text.length).toBeLessThanOrEqual(8000);
    const total = ctx.reduce((sum, f) => sum + f.text.length, 0);
    expect(total).toBeLessThanOrEqual(60000);
  });

  it('limits source count', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ url: `https://${i}.example/`, text: 'content' }));
    expect(buildEvidenceContext(many)).toHaveLength(10);
  });
});

describe('buildBrandIntelligencePrompt', () => {
  it('embeds only the provided evidence URLs', () => {
    const prompt = buildBrandIntelligencePrompt([{ url: 'https://example.com/', title: 'A', text: 'facts' }]);
    expect(prompt).toContain('https://example.com/');
    expect(prompt).toContain('SOURCE 1');
    expect(prompt).not.toContain('other-site.com');
  });
});

describe('parseBrandIntelligence', () => {
  it('parses and validates a well-formed response', () => {
    const parsed = parseBrandIntelligence(VALID_INTELLIGENCE);
    expect(parsed.identity.brandName).toBe('Aurora');
    expect(parsed.identity.productCategories).toEqual(['Analytics']);
  });

  it('strips markdown fences', () => {
    const parsed = parseBrandIntelligence(`\`\`\`json\n${VALID_INTELLIGENCE}\n\`\`\``);
    expect(parsed.identity.brandName).toBe('Aurora');
  });

  it('rejects malformed JSON', () => {
    expect(() => parseBrandIntelligence('{ not json')).toThrow();
  });

  it('rejects responses failing the schema', () => {
    expect(() => parseBrandIntelligence(JSON.stringify({ identity: {} }))).toThrow(BrandIntelligenceValidationError);
  });
});

describe('sanitizeEvidence', () => {
  it('drops claims referencing URLs outside the evidence set', () => {
    const result = parseBrandIntelligence(VALID_INTELLIGENCE);
    const unsafe = {
      ...result,
      evidence: [
        ...result.evidence,
        { claim: 'Made up fact.', sourceUrl: 'https://evil.example.com/page' },
      ],
    };
    const sanitized = sanitizeEvidence(unsafe, fragments);
    expect(sanitized.evidence).toHaveLength(1);
  });
});

describe('extractBrandIntelligence', () => {
  it('returns a validated result from a valid provider response', async () => {
    const provider = fakeProvider([VALID_INTELLIGENCE]);
    const outcome = await extractBrandIntelligence(provider as any, fragments);
    expect(outcome.result.identity.brandName).toBe('Aurora');
    expect(outcome.model).toBe('fake-model');
  });

  it('repairs a malformed first response using a second call', async () => {
    const provider = fakeProvider(['{ broken json', VALID_INTELLIGENCE]);
    const outcome = await extractBrandIntelligence(provider as any, fragments);
    expect(outcome.result.identity.brandName).toBe('Aurora');
    expect(provider.__calls).toHaveLength(2);
  });

  it('fails after an invalid response and a failed repair', async () => {
    const provider = fakeProvider(['{ broken json', '{ still broken']);
    await expect(extractBrandIntelligence(provider as any, fragments)).rejects.toThrow(BrandIntelligenceValidationError);
    expect(provider.__calls).toHaveLength(2);
  });

  it('propagates provider errors without a repair attempt', async () => {
    const provider = fakeProvider([new AiProviderError('fake', 'quota exceeded') as any]);
    await expect(extractBrandIntelligence(provider as any, fragments)).rejects.toThrow(AiProviderError);
    expect(provider.__calls).toHaveLength(1);
  });

  it('budgets ALLaM-2-7B requests to fit its 4K context window', async () => {
    const largeEvidence = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/page-${i}`,
      title: `Page ${i}`,
      text: 'x'.repeat(8000),
    }));
    const provider = fakeProvider([VALID_INTELLIGENCE], 'allam-2-7b');
    await extractBrandIntelligence(provider as any, largeEvidence);
    expect(provider.__calls).toHaveLength(1);
    expect(provider.__calls[0].json).toBe(true);
    expect(provider.__calls[0].maxTokens).toBe(900);
    expect(provider.__calls[0].prompt.length).toBeLessThan(9_000);
  });
});