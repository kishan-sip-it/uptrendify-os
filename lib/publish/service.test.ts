import { describe, it, expect, vi } from 'vitest';
import { publishContent, PublishError } from './service';
import { createStubConnector } from './connectors';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const CONTENT_ID = '00000000-0000-4000-8000-000000000004';
const VERSION_ID = '00000000-0000-4000-8000-000000000006';
const OTHER_VERSION_ID = '00000000-0000-4000-8000-000000000007';

function makeClient(overrides: Array<[string, unknown]> = []) {
  const queues = new Map<string, Array<unknown>>();
  for (const [table, payload] of overrides) {
    const existing = queues.get(table) ?? [];
    existing.push(payload);
    queues.set(table, existing);
  }
  const inserts: Array<{ table: string; payload: unknown }> = [];
  const updates: Array<{ table: string; payload: unknown }> = [];

  const chain = (table: string) => {
    const execute = () => {
      const queue = queues.get(table) ?? [];
      const next = queue.shift();
      if (next !== undefined) return Promise.resolve(next);
      return Promise.resolve({ data: null, error: { message: `No mock result queued for ${table}` } });
    };
    const thenable: PromiseLike<unknown> = { then: (onFul) => execute().then(onFul) };
    const proxy = new Proxy(thenable, {
      get(target, prop) {
        if (prop in target || prop === 'then' || prop === 'catch') return Reflect.get(target, prop);
        const name = String(prop);
        if (name === 'maybeSingle') return async () => execute();
        if (name === 'single') {
          return async () => {
            const value = (await execute()) as any;
            return { data: Array.isArray(value?.data) ? value.data[0] : value?.data ?? null, error: value?.error ?? null };
          };
        }
        if (name === 'insert') {
          return (payload: unknown) => {
            inserts.push({ table, payload });
            return chain(table);
          };
        }
        if (name === 'update') {
          return (payload: unknown) => {
            updates.push({ table, payload });
            return chain(table);
          };
        }
        return () => chain(table);
      },
    });
    return proxy;
  };

  const from = vi.fn((table: string) => chain(String(table)));
  return { from, inserts, updates };
}

const brand = () => ({ data: { id: BRAND_ID, name: 'Acme', client_id: null }, error: null });
const version = () => ({
  data: { id: VERSION_ID, version: 2, headline: 'Headline', body: 'Body copy', content_item_id: CONTENT_ID },
  error: null,
});

function queueForReady(status: string): Array<[string, unknown]> {
  return [
    ['brands', brand()],
    ['content_items', { data: { id: CONTENT_ID, title: 'Q3', status, channel: 'linkedin', client_id: null, campaign_id: null, current_version_id: VERSION_ID }, error: null }],
    ['content_versions', version()],
  ];
}

const base = (status: string) => ({
  organizationId: ORG_ID,
  brandId: BRAND_ID,
  contentId: CONTENT_ID,
  channel: 'linkedin',
  initiatedBy: USER_ID,
});

describe('publishContent', () => {
  it('publishes an approved queued version and records evidence, status and audit', async () => {
    const client = makeClient([
      ...queueForReady('READY_TO_PUBLISH'),
      ['content_publications', { data: null, error: null }],
      ['channel_configurations', { data: { id: 'cfg-1', channel: 'linkedin', status: 'CONNECTED' }, error: null }],
      ['content_publications', { data: { id: 'pub-1' }, error: null }],
      ['content_items', { data: { id: CONTENT_ID, status: 'PUBLISHED' }, error: null }],
      ['audit_logs', { data: null, error: null }],
    ]);

    const result = await publishContent(client as any, base('READY_TO_PUBLISH'), {
      connector: createStubConnector({ channel: 'linkedin', outcome: { status: 'SUCCEEDED', externalReference: 'post-42' } }),
    });

    expect(result).toEqual({ kind: 'published', publicationId: 'pub-1', channel: 'linkedin', externalReference: 'post-42', republished: false });

    const attempt = client.inserts[0];
    expect(attempt.table).toBe('content_publications');
    expect(attempt.payload).toMatchObject({ content_version_id: VERSION_ID, content_item_id: CONTENT_ID, status: 'SUCCEEDED', initiated_by: USER_ID });

    const itemUpdate = client.updates[0];
    expect(itemUpdate.table).toBe('content_items');
    expect(itemUpdate.payload).toMatchObject({ status: 'PUBLISHED' });

    const audit = client.inserts.find((entry) => entry.table === 'audit_logs');
    expect(audit?.payload).toMatchObject({ action: 'content.publish', entity_id: CONTENT_ID });
  });

  it('records a FAILED attempt without flipping the item status', async () => {
    const client = makeClient([
      ...queueForReady('READY_TO_PUBLISH'),
      ['content_publications', { data: null, error: null }],
      ['channel_configurations', { data: { id: 'cfg-1', channel: 'linkedin', status: 'CONNECTED' }, error: null }],
      ['content_publications', { data: { id: 'pub-2' }, error: null }],
      ['audit_logs', { data: null, error: null }],
    ]);

    const result = await publishContent(client as any, base('READY_TO_PUBLISH'), {
      connector: createStubConnector({
        channel: 'linkedin',
        outcome: { status: 'FAILED', errorCode: 'RATE_LIMITED', errorMessage: 'Provider throttled us' },
      }),
    });

    expect(result).toMatchObject({ kind: 'failed', errorCode: 'RATE_LIMITED', errorMessage: 'Provider throttled us' });
    expect(client.inserts.find((entry) => entry.table === 'content_publications')?.payload).toMatchObject({ status: 'FAILED' });
    expect(client.updates).toEqual([]);
    expect(client.inserts.find((entry) => entry.table === 'audit_logs')?.payload).toMatchObject({ action: 'content.publish_attempt' });
  });

  it('returns NOT_CONNECTED when the channel has no connector and no configuration', async () => {
    const client = makeClient([
      ...queueForReady('READY_TO_PUBLISH'),
      ['content_publications', { data: null, error: null }],
      ['channel_configurations', { data: null, error: null }],
      ['content_publications', { data: { id: 'pub-3' }, error: null }],
      ['audit_logs', { data: null, error: null }],
    ]);

    const result = await publishContent(client as any, base('READY_TO_PUBLISH'));

    expect(result).toMatchObject({ kind: 'not_connected', errorCode: 'CHANNEL_NOT_CONNECTED' });
    expect(client.inserts.find((entry) => entry.table === 'content_publications')?.payload).toMatchObject({
      status: 'NOT_CONNECTED',
      content_version_id: VERSION_ID,
    });
    expect(client.updates).toEqual([]);
  });

  it('rejects publishing an unapproved item', async () => {
    const client = makeClient([...queueForReady('APPROVED'), ['content_publications', { data: null, error: null }]]);
    await expect(
      publishContent(client as any, base('APPROVED'), { connector: createStubConnector({ channel: 'linkedin', outcome: { status: 'SUCCEEDED' } }) }),
    ).rejects.toMatchObject({ name: 'PublishError', code: 'NOT_READY_TO_PUBLISH' });
  });

  it('rejects a version that does not belong to the content item', async () => {
    const client = makeClient([
      ['brands', brand()],
      ['content_items', { data: { id: CONTENT_ID, title: 'Q3', status: 'READY_TO_PUBLISH', channel: 'linkedin', client_id: null, campaign_id: null, current_version_id: VERSION_ID }, error: null }],
      ['content_versions', { data: { id: OTHER_VERSION_ID, version: 3, headline: 'Other', body: 'Other', content_item_id: '00000000-0000-4000-8000-00000000dead' }, error: null }],
    ]);

    await expect(
      publishContent(client as any, { ...base('READY_TO_PUBLISH'), versionId: OTHER_VERSION_ID }),
    ).rejects.toMatchObject({ code: 'VERSION_NOT_FOR_ITEM' });
  });

  it('blocks a duplicate publish of the same version and channel', async () => {
    const client = makeClient([
      ...queueForReady('READY_TO_PUBLISH'),
      ['content_publications', { data: { id: 'pub-old' }, error: null }],
    ]);

    await expect(publishContent(client as any, base('READY_TO_PUBLISH'))).rejects.toMatchObject({
      name: 'PublishError' as string,
      code: 'ALREADY_PUBLISHED',
    } as never);
  });

  it('allows an explicit republish of an already published version', async () => {
    const client = makeClient([
      ...queueForReady('READY_TO_PUBLISH'),
      ['channel_configurations', { data: { id: 'cfg-1', channel: 'linkedin', status: 'CONNECTED' }, error: null }],
      ['content_publications', { data: { id: 'pub-4' }, error: null }],
      ['content_items', { data: { id: CONTENT_ID, status: 'PUBLISHED' }, error: null }],
      ['audit_logs', { data: null, error: null }],
    ]);

    const result = await publishContent(client as any, { ...base('READY_TO_PUBLISH'), republish: true }, {
      connector: createStubConnector({ channel: 'linkedin', outcome: { status: 'SUCCEEDED' } }),
    });

    expect(result).toMatchObject({ kind: 'published', republished: true });
  });

  it('deduplicates repeated requests that share an idempotency key', async () => {
    const client = makeClient([
      ...queueForReady('READY_TO_PUBLISH'),
      ['content_publications', { data: { id: 'dup-1', channel: 'linkedin', status: 'SUCCEEDED', error_code: null, error_message: null }, error: null }],
    ]);

    const result = await publishContent(client as any, { ...base('READY_TO_PUBLISH'), idempotencyKey: 'pub:linkedin:2' });

    expect(result).toMatchObject({ kind: 'duplicate', publicationId: 'dup-1', status: 'SUCCEEDED' });
  });

  it('propagates engine errors as a recorded FAILED attempt', async () => {
    const client = makeClient([
      ...queueForReady('READY_TO_PUBLISH'),
      ['content_publications', { data: null, error: null }],
      ['channel_configurations', { data: { id: 'cfg-1', channel: 'linkedin', status: 'CONNECTED' }, error: null }],
      ['content_publications', { data: { id: 'pub-5' }, error: null }],
      ['audit_logs', { data: null, error: null }],
    ]);

    const result = await publishContent(client as any, base('READY_TO_PUBLISH'), {
      connector: {
        id: 'boom',
        channel: 'linkedin',
        publish: async () => {
          throw new Error('network down');
        },
      },
    });

    expect(result).toMatchObject({ kind: 'failed', errorCode: 'PUBLISH_ENGINE_ERROR' });
  });
});