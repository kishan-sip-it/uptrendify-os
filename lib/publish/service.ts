import type { SupabaseClient } from '@supabase/supabase-js';
import { CONTENT_CHANNEL_VALUES } from '@/lib/content/schema';
import { PUBLISH_ERROR_CODES, type PublishOutcome } from '@/lib/publish/schema';
import { resolvePublishConnector, type ContentPublishConnector } from '@/lib/publish/connectors';
import { obs } from '@/lib/obs/logger';

export class PublishError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 409,
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

export type PublishInput = {
  organizationId: string;
  brandId: string;
  contentId: string;
  versionId?: string | null;
  channel?: string | null;
  idempotencyKey?: string | null;
  republish?: boolean;
  initiatedBy?: string | null;
};

export type PublishDeps = {
  connector?: ContentPublishConnector | null;
};

export type PublishResult =
  | { kind: 'published'; publicationId: string; channel: string; externalReference?: string | null; republished: boolean }
  | { kind: 'not_connected'; publicationId: string; channel: string; errorCode: string; errorMessage: string }
  | { kind: 'failed'; publicationId: string; channel: string; errorCode: string; errorMessage: string }
  | { kind: 'duplicate'; publicationId: string; channel: string; status: string; errorCode?: string | null; errorMessage?: string | null };

type BrandRow = { id: string; name: string; client_id: string | null };
type ItemRow = {
  id: string;
  title: string;
  status: string;
  channel: string | null;
  client_id: string | null;
  campaign_id: string | null;
  current_version_id: string | null;
};
type VersionRow = { id: string; version: number; headline: string | null; body: string | null; content_item_id: string };
type ConfigRow = { id: string; channel: string; status: string };

async function loadBrand(supabase: SupabaseClient, args: { brandId: string; organizationId: string }): Promise<BrandRow | null> {
  const result = await supabase
    .from('brands')
    .select('id,name,client_id')
    .eq('id', args.brandId)
    .eq('organization_id', args.organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return (result.data ?? null) as BrandRow | null;
}

async function loadItem(supabase: SupabaseClient, args: { contentId: string; brandId: string; organizationId: string }): Promise<ItemRow | null> {
  const result = await supabase
    .from('content_items')
    .select('id,title,status,channel,client_id,campaign_id,current_version_id')
    .eq('id', args.contentId)
    .eq('brand_id', args.brandId)
    .eq('organization_id', args.organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return (result.data ?? null) as ItemRow | null;
}

export async function publishContent(
  supabase: SupabaseClient,
  input: PublishInput,
  deps: PublishDeps = {},
): Promise<PublishResult> {
  const { organizationId, brandId, contentId, initiatedBy } = input;

  const brand = await loadBrand(supabase, { brandId, organizationId });
  if (!brand) throw new PublishError('BRAND_NOT_FOUND', 'Brand not found', 404);

  const item = await loadItem(supabase, { contentId, brandId, organizationId });
  if (!item) throw new PublishError('CONTENT_NOT_FOUND', 'Content not found', 404);

  const channel = input.channel ?? item.channel ?? null;
  if (!channel) throw new PublishError('CHANNEL_REQUIRED', 'A target channel is required to publish');
  if (!CONTENT_CHANNEL_VALUES.includes(channel as (typeof CONTENT_CHANNEL_VALUES)[number])) {
    throw new PublishError('CHANNEL_INVALID', `Unknown channel "${channel}"`);
  }

  const versionId = input.versionId ?? item.current_version_id;
  if (!versionId) throw new PublishError('NO_VERSION_TO_PUBLISH', 'No content version is available to publish');

  const versionResult = await supabase
    .from('content_versions')
    .select('id,version,headline,body,content_item_id')
    .eq('id', versionId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (versionResult.error) throw versionResult.error;
  const version = versionResult.data as VersionRow | null;
  if (!version) throw new PublishError('VERSION_NOT_FOUND', 'Content version not found', 404);
  if (version.content_item_id !== contentId) {
    throw new PublishError('VERSION_NOT_FOR_ITEM', 'Content version does not belong to this content item');
  }

  if (input.idempotencyKey) {
    const prior = await supabase
      .from('content_publications')
      .select('id,channel,status,error_code,error_message')
      .eq('organization_id', organizationId)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data) {
      obs.info('Publish request deduplicated by idempotency key', { contentId, organizationId, publicationId: prior.data.id });
      return {
        kind: 'duplicate',
        publicationId: prior.data.id as string,
        channel: prior.data.channel as string,
        status: prior.data.status as string,
        errorCode: (prior.data.error_code as string | null) ?? null,
        errorMessage: (prior.data.error_message as string | null) ?? null,
      };
    }
  }

  if (!input.republish) {
    const priorPublished = await supabase
      .from('content_publications')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('content_item_id', contentId)
      .eq('content_version_id', versionId)
      .eq('channel', channel)
      .eq('status', 'SUCCEEDED')
      .limit(1)
      .maybeSingle();
    if (priorPublished.error) throw priorPublished.error;
    if (priorPublished.data) {
      throw new PublishError(
        PUBLISH_ERROR_CODES.ALREADY_PUBLISHED,
        `This version was already published to ${channel}. Pass republish: true to publish again.`,
      );
    }
  }

  if (item.status !== 'READY_TO_PUBLISH') {
    throw new PublishError(
      'NOT_READY_TO_PUBLISH',
      `Content must be approved and queued for publishing first (current status: ${item.status})`,
    );
  }

  const configResult = await supabase
    .from('channel_configurations')
    .select('id,channel,status')
    .eq('organization_id', organizationId)
    .eq('brand_id', brandId)
    .eq('channel', channel)
    .maybeSingle();
  if (configResult.error) throw configResult.error;
  const config = configResult.data as ConfigRow | null;
  const connected = config?.status === 'CONNECTED';

  const connector = deps.connector !== undefined ? deps.connector : resolvePublishConnector(channel);
  if (!connector) {
    const errorCode = connected ? PUBLISH_ERROR_CODES.CONNECTOR_NOT_REGISTERED : PUBLISH_ERROR_CODES.CHANNEL_NOT_CONNECTED;
    return recordAttemptAndReport({
      supabase,
      organizationId,
      brandId,
      initiatedBy,
      item,
      versionId,
      channel,
      idempotencyKey: input.idempotencyKey,
      outcome: {
        status: 'NOT_CONNECTED',
        errorCode,
        errorMessage: connected
          ? `No publish connector is registered for "${channel}". Connect a channel integration before publishing.`
          : `Channel "${channel}" is not connected for this brand. Configure a channel connection before publishing.`,
      },
      contentId,
      notify: true,
      republished: Boolean(input.republish),
    });
  }

  if (!connected) {
    return recordAttemptAndReport({
      supabase,
      organizationId,
      brandId,
      initiatedBy,
      item,
      versionId,
      channel,
      idempotencyKey: input.idempotencyKey,
      outcome: {
        status: 'NOT_CONNECTED',
        errorCode: PUBLISH_ERROR_CODES.CHANNEL_NOT_CONNECTED,
        errorMessage: `Channel "${channel}" is not connected for this brand. Configure a channel connection before publishing.`,
      },
      contentId,
      notify: true,
      republished: Boolean(input.republish),
    });
  }

  let outcome: PublishOutcome;
  try {
    outcome = await connector.publish({ channel, headline: version.headline ?? '', body: version.body ?? '' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outcome = {
      status: 'FAILED',
      errorCode: PUBLISH_ERROR_CODES.PUBLISH_ENGINE_ERROR,
      errorMessage: `Publish engine failed: ${message}`,
    };
  }

  return recordAttemptAndReport({
    supabase,
    organizationId,
    brandId,
    initiatedBy,
    item,
    versionId,
    channel,
    idempotencyKey: input.idempotencyKey,
    outcome,
    contentId,
    notify: true,
    republished: Boolean(input.republish),
  });
}

type AttemptArgs = {
  supabase: SupabaseClient;
  organizationId: string;
  brandId: string;
  initiatedBy?: string | null;
  item: ItemRow;
  versionId: string;
  channel: string;
  idempotencyKey?: string | null;
  outcome: PublishOutcome;
  contentId: string;
  notify: boolean;
  republished: boolean;
};

async function recordAttemptAndReport(args: AttemptArgs): Promise<PublishResult> {
  const { supabase, organizationId, brandId, initiatedBy, item, versionId, channel, idempotencyKey, outcome, contentId, notify, republished } = args;

  const insert = await supabase
    .from('content_publications')
    .insert({
      organization_id: organizationId,
      brand_id: brandId,
      client_id: item.client_id,
      campaign_id: item.campaign_id,
      content_item_id: contentId,
      content_version_id: versionId,
      channel,
      status: outcome.status,
      error_code: outcome.errorCode ?? null,
      error_message: outcome.errorMessage ? outcome.errorMessage.slice(0, 600) : null,
      external_reference: outcome.externalReference ?? null,
      idempotency_key: idempotencyKey ?? null,
      published_at: outcome.status === 'SUCCEEDED' ? new Date().toISOString() : null,
      initiated_by: initiatedBy ?? null,
    })
    .select('id')
    .single();
  if (insert.error) {
    if (insert.error.code === '23505' && idempotencyKey) {
      const prior = await supabase
        .from('content_publications')
        .select('id,channel,status,error_code,error_message')
        .eq('organization_id', organizationId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (!prior.error && prior.data) {
        return {
          kind: 'duplicate',
          publicationId: prior.data.id as string,
          channel: prior.data.channel as string,
          status: prior.data.status as string,
          errorCode: (prior.data.error_code as string | null) ?? null,
          errorMessage: (prior.data.error_message as string | null) ?? null,
        };
      }
    }
    throw insert.error;
  }
  const publicationId = (insert.data as { id: string }).id;

  const successful = outcome.status === 'SUCCEEDED';
  if (successful) {
    const itemUpdate = await supabase
      .from('content_items')
      .update({ status: 'PUBLISHED', updated_at: new Date().toISOString() })
      .eq('id', contentId)
      .eq('organization_id', organizationId)
      .eq('status', 'READY_TO_PUBLISH')
      .select('id,status')
      .maybeSingle();
    if (itemUpdate.error) throw itemUpdate.error;
    if (!itemUpdate.data) {
      const current = await supabase
        .from('content_items')
        .select('status')
        .eq('id', contentId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      const currentStatus = current.error ? null : (current.data?.status as string | null);
      if (currentStatus && currentStatus !== 'PUBLISHED') {
        throw new PublishError('PROVIDER_BLOCKED', 'Content changed state while publishing. Reload and try again.');
      }
    }
  }

  await supabase.from('audit_logs').insert({
    organization_id: organizationId,
    actor_user_id: initiatedBy ?? null,
    action: successful ? 'content.publish' : 'content.publish_attempt',
    entity_type: 'content',
    entity_id: contentId,
    metadata: {
      brandId,
      channel,
      contentVersionId: versionId,
      status: outcome.status,
      errorCode: outcome.errorCode ?? null,
      publicationId,
    },
  });

  if (notify) {
    if (successful) {
      obs.info('Content published', { contentId, brandId, organizationId, channel, publicationId });
    } else {
      obs.warn('Content publish attempt did not succeed', {
        contentId,
        brandId,
        organizationId,
        channel,
        status: outcome.status,
        code: outcome.errorCode ?? null,
      });
    }
  }

  if (successful) {
    return {
      kind: 'published',
      publicationId,
      channel,
      externalReference: outcome.externalReference ?? null,
      republished,
    };
  }

  if (outcome.status === 'NOT_CONNECTED') {
    return {
      kind: 'not_connected',
      publicationId,
      channel,
      errorCode: outcome.errorCode ?? PUBLISH_ERROR_CODES.CHANNEL_NOT_CONNECTED,
      errorMessage: outcome.errorMessage ?? `Channel "${channel}" is not connected`,
    };
  }

  return {
    kind: 'failed',
    publicationId,
    channel,
    errorCode: outcome.errorCode ?? PUBLISH_ERROR_CODES.PUBLISH_ENGINE_ERROR,
    errorMessage: outcome.errorMessage ?? 'Publish failed',
  };
}