import { z } from 'zod';

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  social_post: 'Social Post',
  ad_copy: 'Ad Copy',
  blog_outline: 'Blog / Article Outline',
  blog_draft: 'Blog / Article Draft',
  email: 'Email',
  landing_page: 'Landing Page Copy',
  video_script: 'Video / Reel Script',
  cta_headlines: 'CTA / Headline Variants',
};

export const CONTENT_TYPES = Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
export const CONTENT_TYPE_VALUES: string[] = CONTENT_TYPES.map((entry) => entry.value);
export type ContentType = (typeof CONTENT_TYPE_VALUES)[number];

export const CONTENT_CHANNELS = [
  'linkedin',
  'linkedin_ads',
  'facebook',
  'facebook_ads',
  'instagram',
  'x',
  'tiktok',
  'youtube',
  'google_ads',
  'meta_ads',
  'email',
  'newsletter',
  'blog',
  'website',
  'landing_page',
  'pr',
  'webinar',
  'podcast',
  'print',
  'sms',
  'other',
] as const;
export const CONTENT_CHANNEL_VALUES: string[] = [...CONTENT_CHANNELS];
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];

export const CONTENT_STATUSES = ['DRAFT', 'IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'READY_TO_PUBLISH', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_CREATE_ACTIVE_STATUSES: ContentStatus[] = ['DRAFT', 'IN_REVIEW', 'CLIENT_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'READY_TO_PUBLISH'];

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  CLIENT_REVIEW: 'Client review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  READY_TO_PUBLISH: 'Ready to publish',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

export const CONTENT_GEN_MAX_TOKENS = 3072;
export const CONTENT_BODY_MAX = 20_000;
export const CONTENT_HEADLINE_MAX = 200;
export const CONTENT_RATIONALE_MAX = 3_000;

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

/**
 * User-provided creative intent that drives a generation. This is stored on the
 * content item and replayed (optionally adjusted) into every new version.
 */
export const contentItemInputSchema = z
  .object({
    type: z.enum(CONTENT_TYPE_VALUES as [ContentType, ...ContentType[]]),
    channel: z.enum(CONTENT_CHANNEL_VALUES as [ContentChannel, ...ContentChannel[]]),
    title: nonEmpty(CONTENT_HEADLINE_MAX),
    objective: nonEmpty(2_000).optional(),
    audience: nonEmpty(2_000).optional(),
    context: nonEmpty(4_000).optional(),
    tone: nonEmpty(300).optional(),
    cta: nonEmpty(200).optional(),
    instructions: nonEmpty(4_000).optional(),
  })
  .strict();

export type ContentIntent = z.infer<typeof contentItemInputSchema>;

export type ContentIntentLike = {
  type: string;
  channel: string;
  title: string;
  objective?: string | null;
  audience?: string | null;
  context?: string | null;
  tone?: string | null;
  cta?: string | null;
  instructions?: string | null;
};

/**
 * The AI output contract. Nothing is persisted as a successful generation unless it
 * passes this schema AND matches the requested type/channel (checked by the pipeline).
 */
export const contentGenerationSchema = z
  .object({
    headline: nonEmpty(CONTENT_HEADLINE_MAX),
    body: nonEmpty(CONTENT_BODY_MAX),
    cta: z.string().trim().max(200).nullable().optional(),
    channel: z.string().trim().min(1).max(60).nullable().optional(),
    content_type: z.string().trim().min(1).max(60).nullable().optional(),
    rationale: z.string().trim().max(CONTENT_RATIONALE_MAX).nullable().optional(),
    strategy_references: z.array(z.string().trim().min(1).max(500)).max(30).nullable().optional(),
    brand_fact_references: z.array(z.string().trim().min(1).max(500)).max(40).nullable().optional(),
  })
  .strict();

export type ContentGeneration = z.infer<typeof contentGenerationSchema>;

export class ContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentValidationError';
  }
}

export function isContentValidationError(error: unknown): error is ContentValidationError {
  return error instanceof ContentValidationError;
}

function normalizeAssignableToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveEnumToken(
  value: string | null | undefined,
  values: readonly string[],
  labels?: Record<string, string>,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const exact = values.find((candidate) => candidate === trimmed);
  if (exact) return exact;
  const ci = values.find((candidate) => candidate.toLowerCase() === trimmed.toLowerCase());
  if (ci) return ci;
  if (labels) {
    const byLabel = Object.entries(labels).find(([, label]) => label.toLowerCase() === trimmed.toLowerCase());
    if (byLabel) return byLabel[0];
  }
  return normalizeAssignableToken(trimmed);
}

export function parseContentGeneration(text: string, intent: Pick<ContentIntentLike, 'type' | 'channel'>): ContentGeneration {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const rawText = fence ? fence[1].trim() : trimmed;

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    throw new ContentValidationError('AI output was not valid JSON');
  }

  const parsed = contentGenerationSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
    throw new ContentValidationError(`AI output failed validation: ${issues}`);
  }

  const result = parsed.data;
  const channelLabels = Object.fromEntries(CONTENT_CHANNELS.map((channel) => [channel, channelLabel(channel)])) as Record<string, string>;
  const resolvedChannel = resolveEnumToken(result.channel, CONTENT_CHANNEL_VALUES, channelLabels);
  if (resolvedChannel && resolvedChannel !== intent.channel) {
    throw new ContentValidationError(
      `AI output targeted the wrong channel (${result.channel}); expected ${intent.channel}`,
    );
  }
  const resolvedType = resolveEnumToken(result.content_type, CONTENT_TYPE_VALUES, CONTENT_TYPE_LABELS);
  if (resolvedType && resolvedType !== intent.type) {
    throw new ContentValidationError(
      `AI output produced the wrong content type (${result.content_type}); expected ${intent.type}`,
    );
  }

  return { ...result, channel: resolvedChannel ?? result.channel, content_type: resolvedType ?? result.content_type };
}

export function contentTypeLabel(type: string): string {
  return CONTENT_TYPE_LABELS[type] ?? type.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function channelLabel(channel: string): string {
  return channel.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}