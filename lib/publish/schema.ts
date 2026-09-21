import { z } from 'zod';
import { CONTENT_CHANNEL_VALUES } from '@/lib/content/schema';

export const PUBLICATION_STATUSES = ['QUEUED', 'PUBLISHING', 'SUCCEEDED', 'FAILED', 'NOT_CONNECTED'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const CHANNEL_CONNECTION_STATUSES = ['NOT_CONFIGURED', 'CONNECTED', 'ERROR'] as const;
export type ChannelConnectionStatus = (typeof CHANNEL_CONNECTION_STATUSES)[number];

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  QUEUED: 'Queued',
  PUBLISHING: 'Publishing',
  SUCCEEDED: 'Published',
  FAILED: 'Publish failed',
  NOT_CONNECTED: 'Not connected',
};

export const CHANNEL_CONNECTION_LABELS: Record<ChannelConnectionStatus, string> = {
  NOT_CONFIGURED: 'Not configured',
  CONNECTED: 'Connected',
  ERROR: 'Connection error',
};

export const QUEUE_STATUSES = ['IN_REVIEW', 'CLIENT_REVIEW', 'APPROVED', 'READY_TO_PUBLISH'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const PUBLISH_ERROR_CODES = {
  PROVIDER_BLOCKED: 'PROVIDER_BLOCKED',
  ALREADY_PUBLISHED: 'ALREADY_PUBLISHED',
  CHANNEL_NOT_CONNECTED: 'CHANNEL_NOT_CONNECTED',
  CONNECTOR_NOT_REGISTERED: 'CONNECTOR_NOT_REGISTERED',
  PUBLISH_ENGINE_ERROR: 'PUBLISH_ENGINE_ERROR',
} as const;

export type PublishOutcome = {
  status: 'SUCCEEDED' | 'FAILED' | 'NOT_CONNECTED';
  externalReference?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export const publishRequestSchema = z
  .object({
    contentVersionId: z.string().uuid().nullish(),
    channel: z.enum(CONTENT_CHANNEL_VALUES as [string, ...string[]]).nullish(),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(120)
      .regex(/^[a-zA-Z0-9:_-]+$/)
      .nullish(),
    republish: z.boolean().nullish(),
  })
  .strict();

export type PublishRequest = z.infer<typeof publishRequestSchema>;

export function isChannelConnectionStatus(value: unknown): value is ChannelConnectionStatus {
  return CHANNEL_CONNECTION_STATUSES.includes(value as ChannelConnectionStatus);
}

export function isPublicationStatus(value: unknown): value is PublicationStatus {
  return PUBLICATION_STATUSES.includes(value as PublicationStatus);
}