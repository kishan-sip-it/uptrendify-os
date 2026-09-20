import { z } from 'zod';
import { CAMPAIGN_STATUSES, type CampaignStatus } from '@/lib/campaign/schema';

export const CAMPAIGN_STATUS_ACTIONS = [
  'plan',
  'activate',
  'pause',
  'complete',
  'archive',
  'back_to_draft',
] as const;

export type CampaignStatusAction = (typeof CAMPAIGN_STATUS_ACTIONS)[number];

export const CAMPAIGN_ACTION_TRANSITIONS: Record<
  CampaignStatusAction,
  { from: CampaignStatus[]; to: CampaignStatus }
> = {
  plan: { from: ['DRAFT'], to: 'PLANNED' },
  activate: { from: ['PLANNED'], to: 'ACTIVE' },
  pause: { from: ['ACTIVE'], to: 'PLANNED' },
  complete: { from: ['PLANNED', 'ACTIVE'], to: 'COMPLETED' },
  archive: { from: ['DRAFT', 'PLANNED', 'ACTIVE', 'COMPLETED'], to: 'ARCHIVED' },
  back_to_draft: { from: ['PLANNED'], to: 'DRAFT' },
};

export const CAMPAIGN_ACTION_LABELS: Record<CampaignStatusAction, string> = {
  plan: 'Move to Planned',
  activate: 'Activate',
  pause: 'Pause',
  complete: 'Complete',
  archive: 'Archive',
  back_to_draft: 'Back to Draft',
};

export const CAMPAIGN_ACTION_HINTS: Record<CampaignStatusAction, string> = {
  plan: 'Campaign has been approved and scheduled',
  activate: 'Campaign is now running',
  pause: 'Pause the running campaign',
  complete: 'Mark this campaign as finished',
  archive: 'Move this campaign to the archive',
  back_to_draft: 'Send the campaign back to drafting',
};

export const campaignStatusActionSchema = z
  .object({
    action: z.enum(CAMPAIGN_STATUS_ACTIONS),
  })
  .strict();

export type CampaignStatusActionInput = z.infer<typeof campaignStatusActionSchema>;

export function canTransition(current: CampaignStatus, action: CampaignStatusAction): boolean {
  const transition = CAMPAIGN_ACTION_TRANSITIONS[action];
  return transition.from.includes(current);
}

export function allowedActionsFor(current: CampaignStatus): CampaignStatusAction[] {
  return CAMPAIGN_STATUS_ACTIONS.filter((action) => canTransition(current, action));
}

export function targetStatusFor(action: CampaignStatusAction): CampaignStatus {
  return CAMPAIGN_ACTION_TRANSITIONS[action].to;
}

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return CAMPAIGN_STATUSES.includes(value as CampaignStatus);
}