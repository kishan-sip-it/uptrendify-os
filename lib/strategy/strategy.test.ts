import { describe, it, expect, vi } from 'vitest';
import type { AiProvider, GenerateResult } from '@/lib/ai/types';
import { AiProviderError } from '@/lib/ai/types';
import { StrategyValidationError } from './schema';
import { extractStrategy, parseStrategy } from './strategy';

function objective(seed: number) {
  return { objective: `Objective ${seed}`, rationale: `Why ${seed}`, successMetric: `Metric ${seed}`, timeHorizon: '90 days' };
}

function validStrategyText() {
  return JSON.stringify({
    executiveSummary: { summary: 'A focused go-to-market strategy.', currentSituation: null, strategicDirection: null },
    businessUnderstanding: { whatCompanySells: 'Dev tooling', targetAudience: 'SaaS teams', problemsSolved: ['Slow shipping'], valueProposition: null, differentiators: ['Speed'], evidenceBasis: [] },
    objectives: [objective(1), objective(2), objective(3)],
    icp: { primaryAudience: 'CTO', secondaryAudience: null, painPoints: [], motivations: [], buyingTriggers: [], objections: [] },
    positioning: { positioningStatement: null, corePromise: null, differentiators: [], proofPoints: [], gaps: [], uncertainties: [] },
    messaging: { coreMessage: null, supportingMessages: [], valuePropositions: [], ctaDirections: [], toneOfVoice: null },
    contentStrategy: { contentPillars: [], topicClusters: [], educationalThemes: [], conversionThemes: [], trustThemes: [], contentFormats: [] },
    seoStrategy: { keywordOpportunities: [], searchIntentCategories: [], priorityTopics: [], onPageOpportunities: [], internalLinkingOpportunities: [], gaps: [] },
    channels: [],
    campaigns: [],
    roadmap: { days1To30: [], days31To60: [], days61To90: [] },
    kpis: { awareness: [], traffic: [], seo: [], engagement: [], leadsAndConversions: [], revenue: [] },
    risksAndGaps: { missingInformation: [], evidenceLimitations: [], strategicRisks: [], dependencies: [] },
    assumptions: [],
  });
}

function fakeProvider(generate: (input: { prompt: string }) => Promise<GenerateResult>): AiProvider {
  return {
    id: 'fake',
    defaultModel: 'fake-model',
    configured: () => true,
    generate,
    health: async () => ({ id: 'fake', ok: true, configured: true }),
  };
}

describe('parseStrategy', () => {
  it('parses a valid strategy payload', () => {
    const parsed = parseStrategy(validStrategyText());
    expect(parsed.objectives).toHaveLength(3);
  });

  it('strips markdown fences', () => {
    const parsed = parseStrategy(`\`\`\`json\n${validStrategyText()}\n\`\`\``);
    expect(parsed.executiveSummary.summary).toBe('A focused go-to-market strategy.');
  });

  it('throws StrategyValidationError on invalid JSON', () => {
    expect(() => parseStrategy('not json')).toThrow(StrategyValidationError);
  });

  it('throws StrategyValidationError when the output violates the schema', () => {
    const bad = JSON.parse(validStrategyText());
    bad.objectives = [objective(1)];
    expect(() => parseStrategy(JSON.stringify(bad))).toThrow(StrategyValidationError);
  });
});

describe('extractStrategy', () => {
  const context = 'BRAND PROFILE CONTEXT';

  it('returns the parsed result from the provider', async () => {
    const generate = vi.fn().mockResolvedValue({ text: validStrategyText(), model: 'gemini-3.6-flash', usage: { inputTokens: 10, outputTokens: 5 } });
    const outcome = await extractStrategy(fakeProvider(generate), context);
    expect(outcome.result.objectives).toHaveLength(3);
    expect(outcome.model).toBe('gemini-3.6-flash');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].json).toBe(true);
    expect(generate.mock.calls[0][0].prompt).toContain(context);
  });

  it('repairs an invalid first response using the repair prompt', async () => {
    const bad = JSON.parse(validStrategyText());
    bad.objectives = [objective(1)];
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: JSON.stringify(bad), model: 'fake-model' })
      .mockResolvedValueOnce({ text: validStrategyText(), model: 'fake-model' });

    const outcome = await extractStrategy(fakeProvider(generate), context);
    expect(outcome.result.objectives).toHaveLength(3);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].prompt).toContain('Validation error');
    expect(generate.mock.calls[1][0].prompt).toContain('not match the required JSON schema');
  });

  it('throws StrategyValidationError when the repair attempt also fails validation', async () => {
    const bad = JSON.parse(validStrategyText());
    bad.objectives = [objective(1)];
    const generate = vi.fn().mockResolvedValue({ text: JSON.stringify(bad), model: 'fake-model' });

    await expect(extractStrategy(fakeProvider(generate), context)).rejects.toThrow(StrategyValidationError);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('propagates provider transport errors without mangling them', async () => {
    const generate = vi.fn().mockRejectedValue(new AiProviderError('fake', 'upstream 503', 503));
    await expect(extractStrategy(fakeProvider(generate), context)).rejects.toBeInstanceOf(AiProviderError);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});