import { z } from 'zod';

export const CAMPAIGN_CHANNELS = [
  'meta_ads',
  'google_ads',
  'linkedin',
  'email',
  'website',
  'organic_social',
  'youtube',
  'x',
  'tiktok',
  'pr',
  'events',
  'podcast',
  'sms',
  'other',
] as const;

export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CAMPAIGN_CHANNEL_LABELS: Record<string, string> = {
  meta_ads: 'Meta / Instagram ads',
  google_ads: 'Google ads',
  linkedin: 'LinkedIn',
  email: 'Email',
  website: 'Website',
  organic_social: 'Organic social',
  youtube: 'YouTube',
  x: 'X / Twitter',
  tiktok: 'TikTok',
  pr: 'PR',
  events: 'Events',
  podcast: 'Podcast',
  sms: 'SMS',
  other: 'Other',
};

export const CAMPAIGN_STATUSES = ['DRAFT', 'PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export const CAMPAIGN_NAME_MAX = 200;
export const CAMPAIGN_OBJECTIVE_MAX = 2000;
export const CAMPAIGN_DESCRIPTION_MAX = 4000;
export const CAMPAIGN_BUDGET_MAX = 999_999_999_999.99;
export const CAMPAIGN_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const CAMPAIGN_CURRENCY_PATTERN = /^[A-Z]{3}$/;

const dateString = z.string().regex(CAMPAIGN_DATE_PATTERN, 'Expected a YYYY-MM-DD date');

export const campaignCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(CAMPAIGN_NAME_MAX),
    objective: z.string().trim().max(CAMPAIGN_OBJECTIVE_MAX).nullish(),
    description: z.string().trim().max(CAMPAIGN_DESCRIPTION_MAX).nullish(),
    strategyId: z.string().uuid(),
    startDate: dateString.nullish(),
    endDate: dateString.nullish(),
    budget: z.number().finite().nonnegative().max(CAMPAIGN_BUDGET_MAX).nullish(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(CAMPAIGN_CURRENCY_PATTERN, 'Expected an ISO 4217 currency code')
      .nullish(),
    channels: z.array(z.enum(CAMPAIGN_CHANNELS)).max(CAMPAIGN_CHANNELS.length).nullish(),
  })
  .strict()
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.startDate === null ||
      value.endDate === undefined ||
      value.endDate === null ||
      value.startDate <= value.endDate,
    { message: 'startDate must be on or before endDate', path: ['endDate'] },
  );

export const campaignUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(CAMPAIGN_NAME_MAX).optional(),
    objective: z.string().trim().max(CAMPAIGN_OBJECTIVE_MAX).nullish(),
    description: z.string().trim().max(CAMPAIGN_DESCRIPTION_MAX).nullish(),
    strategyId: z.string().uuid().optional(),
    startDate: dateString.nullish(),
    endDate: dateString.nullish(),
    budget: z.number().finite().nonnegative().max(CAMPAIGN_BUDGET_MAX).nullish(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(CAMPAIGN_CURRENCY_PATTERN, 'Expected an ISO 4217 currency code')
      .nullish(),
    channels: z.array(z.enum(CAMPAIGN_CHANNELS)).max(CAMPAIGN_CHANNELS.length).nullish(),
  })
  .strict()
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.startDate === null ||
      value.endDate === undefined ||
      value.endDate === null ||
      value.startDate <= value.endDate,
    { message: 'startDate must be on or before endDate', path: ['endDate'] },
  );

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>;

export function safeValidateCampaignCreate(value: unknown) {
  return campaignCreateSchema.safeParse(value);
}