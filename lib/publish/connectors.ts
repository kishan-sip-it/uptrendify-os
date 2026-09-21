import { CONTENT_CHANNEL_VALUES } from '@/lib/content/schema';
import type { PublishOutcome } from '@/lib/publish/schema';

export type ContentPublishConnector = {
  id: string;
  channel: string;
  publish(input: { channel: string; headline: string; body: string }): Promise<PublishOutcome>;
};

export function createStubConnector(opts: { channel: string; outcome: PublishOutcome }): ContentPublishConnector {
  return {
    id: `stub:${opts.channel}`,
    channel: opts.channel,
    async publish(input) {
      return opts.outcome;
    },
  };
}

const registeredConnectors: ContentPublishConnector[] = [];

export function registerPublishConnector(connector: ContentPublishConnector): void {
  const index = registeredConnectors.findIndex((existing) => existing.channel === connector.channel);
  if (index >= 0) registeredConnectors[index] = connector;
  else registeredConnectors.push(connector);
}

export function resolvePublishConnector(channel: string): ContentPublishConnector | null {
  const known = CONTENT_CHANNEL_VALUES.includes(channel as (typeof CONTENT_CHANNEL_VALUES)[number]);
  if (!known) return null;
  return registeredConnectors.find((connector) => connector.channel === channel) ?? null;
}