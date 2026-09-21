import { z } from 'zod';

export const STRATEGY_MAX_TOKENS = 8192;
export const STRATEGY_OBJECTIVES_MIN = 3;
export const STRATEGY_OBJECTIVES_MAX = 5;
export const STRATEGY_ASSUMPTIONS_MAX = 25;
export const STRATEGY_CHANNELS_MAX = 12;
export const STRATEGY_CAMPAIGNS_MAX = 8;

const arrayOf = (max: number) => z.array(z.string().min(1).max(max)).nullish().transform((value) => value ?? []);
const nullableText = (max: number) => z.string().min(1).max(max).nullish();
const text = (max: number) => z.string().min(1).max(max);

const executiveSummarySchema = z.object({
  summary: text(3000),
  currentSituation: nullableText(3000),
  strategicDirection: nullableText(3000),
});

const businessUnderstandingSchema = z.object({
  whatCompanySells: nullableText(3000),
  targetAudience: nullableText(3000),
  problemsSolved: arrayOf(600),
  valueProposition: nullableText(3000),
  differentiators: arrayOf(600),
  evidenceBasis: arrayOf(800),
});

const objectiveSchema = z.object({
  objective: text(600),
  rationale: text(1000),
  successMetric: text(600),
  timeHorizon: text(200),
});

const icpSchema = z.object({
  primaryAudience: nullableText(1000),
  secondaryAudience: nullableText(1000),
  painPoints: arrayOf(400),
  motivations: arrayOf(400),
  buyingTriggers: arrayOf(400),
  objections: arrayOf(400),
});

const positioningSchema = z.object({
  positioningStatement: nullableText(2000),
  corePromise: nullableText(1000),
  differentiators: arrayOf(400),
  proofPoints: arrayOf(600),
  gaps: arrayOf(600),
  uncertainties: arrayOf(600),
});

const messagingSchema = z.object({
  coreMessage: nullableText(1500),
  supportingMessages: arrayOf(1000),
  valuePropositions: arrayOf(800),
  ctaDirections: arrayOf(400),
  toneOfVoice: nullableText(600),
});

const contentStrategySchema = z.object({
  contentPillars: arrayOf(300),
  topicClusters: arrayOf(300),
  educationalThemes: arrayOf(300),
  conversionThemes: arrayOf(300),
  trustThemes: arrayOf(300),
  contentFormats: arrayOf(200),
});

const searchIntentCategorySchema = z.object({
  intent: text(200),
  topics: arrayOf(300),
});

const seoStrategySchema = z.object({
  keywordOpportunities: arrayOf(300),
  searchIntentCategories: z
    .array(searchIntentCategorySchema)
    .nullish()
    .transform((value) => value ?? []),
  priorityTopics: arrayOf(300),
  onPageOpportunities: arrayOf(400),
  internalLinkingOpportunities: arrayOf(400),
  gaps: arrayOf(400),
});

const channelStrategyItemSchema = z.object({
  channel: text(200),
  purpose: text(600),
  audience: nullableText(600),
  contentTypes: arrayOf(200),
  strategicRole: text(600),
  confidence: nullableText(50),
});

const campaignItemSchema = z.object({
  name: text(300),
  objective: text(1000),
  audience: nullableText(600),
  coreIdea: text(1000),
  channel: text(200),
  cta: text(400),
  sequence: arrayOf(600),
});

const roadmapItemSchema = z.object({
  action: text(600),
  reason: text(600),
  expectedOutcome: text(600),
  priority: nullableText(50),
});

const roadmapSchema = z.object({
  days1To30: z.array(roadmapItemSchema).nullish().transform((value) => value ?? []),
  days31To60: z.array(roadmapItemSchema).nullish().transform((value) => value ?? []),
  days61To90: z.array(roadmapItemSchema).nullish().transform((value) => value ?? []),
});

const kpisSchema = z.object({
  awareness: arrayOf(400),
  traffic: arrayOf(400),
  seo: arrayOf(400),
  engagement: arrayOf(400),
  leadsAndConversions: arrayOf(400),
  revenue: arrayOf(400),
});

const risksAndGapsSchema = z.object({
  missingInformation: arrayOf(600),
  evidenceLimitations: arrayOf(600),
  strategicRisks: arrayOf(600),
  dependencies: arrayOf(600),
});

const assumptionSchema = z.object({
  statement: text(600),
  basis: z.string().min(1).max(50).nullish().transform((value) => value ?? 'assumption'),
  impact: nullableText(400),
});

export const strategySchema = z.object({
  executiveSummary: executiveSummarySchema,
  businessUnderstanding: businessUnderstandingSchema,
  objectives: z.array(objectiveSchema).min(STRATEGY_OBJECTIVES_MIN).max(STRATEGY_OBJECTIVES_MAX),
  icp: icpSchema,
  positioning: positioningSchema,
  messaging: messagingSchema,
  contentStrategy: contentStrategySchema,
  seoStrategy: seoStrategySchema,
  channels: z.array(channelStrategyItemSchema).nullish().transform((value) => value ?? []),
  campaigns: z.array(campaignItemSchema).nullish().transform((value) => value ?? []),
  roadmap: roadmapSchema,
  kpis: kpisSchema,
  risksAndGaps: risksAndGapsSchema,
  assumptions: z.array(assumptionSchema).nullish().transform((value) => value ?? []),
});

export type StrategyOutput = z.infer<typeof strategySchema>;
export type StrategyObjective = StrategyOutput['objectives'][number];
export type StrategyChannel = StrategyOutput['channels'][number];
export type StrategyCampaign = StrategyOutput['campaigns'][number];
export type StrategyRoadmapItem = StrategyOutput['roadmap']['days1To30'][number];
export type StrategyAssumption = StrategyOutput['assumptions'][number];

export class StrategyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategyValidationError';
  }
}

export function isStrategyValidationError(error: unknown): error is StrategyValidationError {
  return error instanceof StrategyValidationError;
}

const requiredPresentationGroups = [
  'executiveSummary',
  'businessUnderstanding',
  'objectives',
  'icp',
  'positioning',
  'messaging',
  'contentStrategy',
  'seoStrategy',
  'channels',
  'campaigns',
  'roadmap',
  'kpis',
  'risksAndGaps',
  'assumptions',
] as const;

function toRoadmapItems(value: unknown): StrategyOutput['roadmap']['days1To30'] {
  return Array.isArray(value) ? value : [];
}

/**
 * Presentation-only normalization for already-persisted strategy output.
 *
 * Generation stays on the strict `strategySchema`; this does NOT weaken it.
 * It is used purely to decide whether a SUCCEEDED strategy carries enough
 * current-schema structure to be rendered safely, and to fill safe defaults
 * for legacy/incomplete nested output (e.g. a roadmap object with no columns).
 *
 * Returns null when the output is missing required current-schema groups, so
 * callers can show a regeneration prompt instead of rendering incomplete data.
 */
export function normalizeStrategyOutputForPresentation(raw: unknown): StrategyOutput | null {
  const output = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!output) return null;
  for (const key of requiredPresentationGroups) {
    if (output[key] == null) return null;
  }
  const roadmap = output.roadmap as Record<string, unknown> | null | undefined;
  return {
    ...output,
    roadmap: {
      days1To30: toRoadmapItems(roadmap?.days1To30),
      days31To60: toRoadmapItems(roadmap?.days31To60),
      days61To90: toRoadmapItems(roadmap?.days61To90),
    },
  } as unknown as StrategyOutput;
}