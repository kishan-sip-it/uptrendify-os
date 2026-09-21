import { describe, it, expect } from 'vitest';
import { strategySchema, normalizeStrategyOutputForPresentation } from './schema';

function objective(seed: number) {
  return {
    objective: `Objective ${seed}`,
    rationale: `Why ${seed}`,
    successMetric: `Metric ${seed}`,
    timeHorizon: '90 days',
  };
}

function validStrategy() {
  return {
    executiveSummary: {
      summary: 'A focused go-to-market strategy.',
      currentSituation: 'Early stage, strong product.',
      strategicDirection: 'Compounding SEO and outbound.',
    },
    businessUnderstanding: {
      whatCompanySells: 'Developer tooling',
      targetAudience: 'Small SaaS teams',
      problemsSolved: ['Slow shipping'],
      valueProposition: 'Ship faster with verified evidence.',
      differentiators: ['Speed', 'Evidence-first'],
      evidenceBasis: ['Site copy positions the tool around speed'],
    },
    objectives: [objective(1), objective(2), objective(3)],
    icp: {
      primaryAudience: 'Head of Engineering at seed SaaS',
      secondaryAudience: null,
      painPoints: ['Context switching'],
      motivations: ['Career growth'],
      buyingTriggers: ['Pricing page visit'],
      objections: ['Migration risk'],
    },
    positioning: {
      positioningStatement: 'The evidence-first dev tooling platform',
      corePromise: 'Faster releases',
      differentiators: ['Opinionated workflows'],
      proofPoints: ['Case studies on site'],
      gaps: ['No pricing transparency'],
      uncertainties: ['Unclear ICP maturity'],
    },
    messaging: {
      coreMessage: 'Ship without the guesswork',
      supportingMessages: ['Stay in flow'],
      valuePropositions: ['Cut release time'],
      ctaDirections: ['Book a demo'],
      toneOfVoice: 'Direct, technical',
    },
    contentStrategy: {
      contentPillars: ['Engineering culture'],
      topicClusters: ['CI/CD'],
      educationalThemes: ['How-to guides'],
      conversionThemes: ['ROI calculator'],
      trustThemes: ['Customer stories'],
      contentFormats: ['Blog', 'Webinar'],
    },
    seoStrategy: {
      keywordOpportunities: ['dev tooling'],
      searchIntentCategories: [{ intent: 'commercial', topics: ['alternatives'] }],
      priorityTopics: ['vs competitors'],
      onPageOpportunities: ['Improve hero copy'],
      internalLinkingOpportunities: ['Link docs to blog'],
      gaps: ['No comparison content'],
    },
    channels: [
      {
        channel: 'Organic Search',
        purpose: 'Capture in-market demand',
        audience: 'Engineers searching for tooling',
        contentTypes: ['Blog'],
        strategicRole: 'Primary acquisition channel',
        confidence: 'High',
      },
    ],
    campaigns: [
      {
        name: 'Developer Resources',
        objective: 'Educate and capture leads',
        audience: 'Engineers',
        coreIdea: 'The definitive guide to CI/CD',
        channel: 'Organic Search',
        cta: 'Get the guide',
        sequence: ['Blog post', 'Lead magnet', 'Nurture email'],
      },
    ],
    roadmap: {
      days1To30: [{ action: 'Audit site', reason: 'Find gaps', expectedOutcome: 'Priority list', priority: 'High' }],
      days31To60: [{ action: 'Publish pillars', reason: 'SEO growth', expectedOutcome: 'Traffic', priority: 'Medium' }],
      days61To90: [{ action: 'Launch campaign', reason: 'Scale', expectedOutcome: 'Pipeline', priority: 'Medium' }],
    },
    kpis: {
      awareness: ['Share of voice'],
      traffic: ['Organic sessions'],
      seo: ['Keyword rankings'],
      engagement: ['Time on page'],
      leadsAndConversions: ['SQLs'],
      revenue: ['Pipeline influenced'],
    },
    risksAndGaps: {
      missingInformation: ['Pricing details'],
      evidenceLimitations: ['Single source site'],
      strategicRisks: ['Competitive pressure'],
      dependencies: ['Design capacity'],
    },
    assumptions: [
      { statement: 'Budget and headcount are available', basis: null, impact: 'Affects resourcing' },
      { statement: 'Site conversion rate baseline', basis: 'assumption', impact: null },
    ],
  };
}

describe('strategySchema', () => {
  it('parses a fully valid strategy output', () => {
    const parsed = strategySchema.safeParse(validStrategy());
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.objectives).toHaveLength(3);
  });

  it('rejects fewer than 3 objectives', () => {
    const input = validStrategy();
    input.objectives = [objective(1), objective(2)];
    expect(strategySchema.safeParse(input).success).toBe(false);
  });

  it('rejects more than 5 objectives', () => {
    const input = validStrategy();
    input.objectives = [objective(1), objective(2), objective(3), objective(4), objective(5), objective(6)];
    expect(strategySchema.safeParse(input).success).toBe(false);
  });

  it('defaults missing assumption basis to "assumption"', () => {
    const input = validStrategy();
    const parsed = strategySchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.assumptions[0].basis).toBe('assumption');
  });

  it('defaults nullish optional fields to empty arrays instead of failing', () => {
    const input = validStrategy() as Record<string, unknown>;
    input.channels = null;
    input.campaigns = null;
    input.seoStrategy = { ...(input.seoStrategy as object), searchIntentCategories: null };
    input.roadmap = { days1To30: null, days31To60: undefined, days61To90: [] };
    input.assumptions = null;

    const parsed = strategySchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.channels).toEqual([]);
    expect(parsed.data.campaigns).toEqual([]);
    expect(parsed.data.seoStrategy.searchIntentCategories).toEqual([]);
    expect(parsed.data.roadmap.days1To30).toEqual([]);
    expect(parsed.data.assumptions).toEqual([]);
  });

  it('requires the executive summary to be present', () => {
    const input = validStrategy();
    (input.executiveSummary as unknown) = { currentSituation: null, strategicDirection: null };
    expect(strategySchema.safeParse(input).success).toBe(false);
  });
});
describe('normalizeStrategyOutputForPresentation', () => {
  function presentableOutput() {
    return {
      executiveSummary: { summary: 'x' },
      businessUnderstanding: {},
      objectives: [],
      icp: {},
      positioning: {},
      messaging: {},
      contentStrategy: {},
      seoStrategy: {},
      channels: [],
      campaigns: [],
      roadmap: { days1To30: [], days31To60: [], days61To90: [] },
      kpis: {},
      risksAndGaps: {},
      assumptions: [],
    };
  }

  it('returns null for non-object values', () => {
    expect(normalizeStrategyOutputForPresentation(null)).toBeNull();
    expect(normalizeStrategyOutputForPresentation(undefined)).toBeNull();
    expect(normalizeStrategyOutputForPresentation('legacy')).toBeNull();
    expect(normalizeStrategyOutputForPresentation(123)).toBeNull();
  });

  it('returns null when the roadmap group is missing entirely (legacy output)', () => {
    const output = presentableOutput();
    delete (output as { roadmap?: unknown }).roadmap;
    expect(normalizeStrategyOutputForPresentation(output)).toBeNull();
  });

  it('returns null when any required top-level group is missing', () => {
    const output = presentableOutput();
    delete (output as { kpis?: unknown }).kpis;
    expect(normalizeStrategyOutputForPresentation(output)).toBeNull();
  });

  it('fills missing roadmap columns with empty arrays', () => {
    const output = presentableOutput();
    (output as { roadmap: unknown }).roadmap = {};
    const normalized = normalizeStrategyOutputForPresentation(output);
    expect(normalized).not.toBeNull();
    expect(normalized!.roadmap.days1To30).toEqual([]);
    expect(normalized!.roadmap.days31To60).toEqual([]);
    expect(normalized!.roadmap.days61To90).toEqual([]);
  });

  it('preserves existing roadmap items', () => {
    const output = presentableOutput();
    (output as { roadmap: unknown }).roadmap = { days1To30: [{ action: 'Launch' }], days31To60: null, days61To90: undefined };
    const normalized = normalizeStrategyOutputForPresentation(output);
    expect(normalized!.roadmap.days1To30).toEqual([{ action: 'Launch' }]);
    expect(normalized!.roadmap.days31To60).toEqual([]);
    expect(normalized!.roadmap.days61To90).toEqual([]);
  });

  it('does not weaken the strict generation schema', () => {
    const input = validStrategy();
    delete (input as { roadmap?: unknown }).roadmap;
    expect(strategySchema.safeParse(input).success).toBe(false);
  });
});
