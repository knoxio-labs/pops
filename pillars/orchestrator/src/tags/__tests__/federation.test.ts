import { describe, expect, it, vi } from 'vitest';

import {
  createTagFederation,
  type TagExpansionInvoker,
  type TaggedListInvoker,
} from '../federation.js';

import type { CallResult } from '@pops/pillar-sdk/client';
import type { PillarSnapshot } from '@pops/pillar-sdk/discovery';
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

const REQUESTED_TAG_IDS = ['requested-tag'];
const EXPANDED_TAG_IDS = ['tag-parent', 'tag-child', 'tag-merged'];

interface ExpandedTagIds {
  ids: string[];
  unknownIds: string[];
}

function manifestFor(pillarId: string, carriesTags = true): ManifestPayload {
  return {
    pillar: pillarId,
    version: '0.1.0',
    contract: {
      package: '@pops/' + pillarId + '-contract',
      version: '0.1.0',
      tag: 'contract-' + pillarId + '@v0.1.0',
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    ...(carriesTags ? { tags: { carriers: [{ entityType: 'tagged-record' }] } } : {}),
    healthcheck: { path: '/health' },
  };
}

function snapshot(
  pillarId: string,
  options: {
    carriesTags?: boolean;
    registered?: boolean;
    status?: PillarSnapshot['status'];
  } = {}
): PillarSnapshot {
  return {
    pillarId,
    baseUrl: 'http://' + pillarId + ':3000',
    manifest: manifestFor(pillarId, options.carriesTags ?? true),
    registered: options.registered ?? true,
    lastSeenAt: new Date(),
    ...(options.status !== undefined ? { status: options.status } : { status: 'healthy' }),
  };
}

function taggedThing(pillarId: string, id: string) {
  return {
    uri: 'pops:' + pillarId + '/' + id,
    entityType: 'tagged-record',
    title: pillarId + ' item ' + id,
    tagIds: EXPANDED_TAG_IDS,
    date: null,
    amountCents: null,
  };
}

function ok(value: unknown): CallResult<unknown> {
  return { kind: 'ok', value };
}

function expanded(ids = EXPANDED_TAG_IDS): CallResult<ExpandedTagIds> {
  return { kind: 'ok', value: { ids, unknownIds: [] } };
}

function federator(
  snapshots: readonly PillarSnapshot[],
  invoke: TaggedListInvoker,
  options: {
    expand?: TagExpansionInvoker;
    onWarn?: (message: string, detail?: unknown) => void;
  } = {}
) {
  return createTagFederation({
    expand: options.expand ?? (async () => expanded()),
    invoke,
    snapshotReader: async () => snapshots,
    onWarn: options.onWarn ?? vi.fn(),
  });
}

describe('createTagFederation', () => {
  it('returns one merged section for each successful carrier pillar', async () => {
    const invoke = vi.fn<TaggedListInvoker>(async (pillarId) =>
      ok({
        items: [taggedThing(pillarId, '1')],
        nextCursor: null,
      })
    );
    const source = federator([snapshot('finance'), snapshot('purchases')], invoke);

    const result = await source({ tagIds: REQUESTED_TAG_IDS });

    expect(result.sections).toEqual([
      { pillarId: 'finance', items: [taggedThing('finance', '1')], nextCursor: null },
      { pillarId: 'purchases', items: [taggedThing('purchases', '1')], nextCursor: null },
    ]);
    expect(result.pillars).toEqual([
      { pillarId: 'finance', status: 'ok' },
      { pillarId: 'purchases', status: 'ok' },
    ]);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('does not call a registered pillar without a tags manifest block', async () => {
    const invoke = vi.fn<TaggedListInvoker>(async (pillarId) =>
      ok({ items: [taggedThing(pillarId, '1')], nextCursor: null })
    );
    const source = federator(
      [snapshot('finance'), snapshot('inventory', { carriesTags: false })],
      invoke
    );

    const result = await source({ tagIds: REQUESTED_TAG_IDS });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('finance', {
      tagIds: EXPANDED_TAG_IDS,
      limit: 200,
    });
    expect(result.pillars).toEqual([{ pillarId: 'finance', status: 'ok' }]);
  });

  it('reports an unavailable carrier and retains sections from other pillars', async () => {
    const invoke: TaggedListInvoker = async (pillarId) =>
      pillarId === 'finance'
        ? { kind: 'unavailable', pillar: pillarId }
        : ok({ items: [taggedThing(pillarId, '1')], nextCursor: null });
    const source = federator([snapshot('finance'), snapshot('purchases')], invoke);

    const result = await source({ tagIds: REQUESTED_TAG_IDS });

    expect(result.sections.map((section) => section.pillarId)).toEqual(['purchases']);
    expect(result.pillars).toEqual([
      { pillarId: 'finance', status: 'unavailable' },
      { pillarId: 'purchases', status: 'ok' },
    ]);
  });

  it('excludes and reports a carrier response that fails the shared schema', async () => {
    const onWarn = vi.fn();
    const invoke: TaggedListInvoker = async () =>
      ok({ items: [{ uri: 'pops:finance/1' }], nextCursor: null });
    const source = federator([snapshot('finance')], invoke, { onWarn });

    const result = await source({ tagIds: REQUESTED_TAG_IDS });

    expect(result.sections).toEqual([]);
    expect(result.pillars).toEqual([{ pillarId: 'finance', status: 'unavailable' }]);
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining('returned malformed data'),
      expect.anything()
    );
  });

  it('fails the whole request when tag expansion fails', async () => {
    const invoke = vi.fn<TaggedListInvoker>();
    const snapshotReader = vi.fn(async () => [snapshot('finance')]);
    const source = createTagFederation({
      expand: async () => ({ kind: 'unavailable', pillar: 'tags' }),
      invoke,
      snapshotReader,
      onWarn: vi.fn(),
    });

    await expect(source({ tagIds: REQUESTED_TAG_IDS })).rejects.toMatchObject({
      result: { kind: 'unavailable', pillar: 'tags' },
    });
    expect(snapshotReader).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('skips unhealthy and unregistered carrier pillars', async () => {
    const invoke = vi.fn<TaggedListInvoker>();
    const source = federator(
      [
        snapshot('finance', { status: 'unavailable' }),
        snapshot('purchases', { registered: false }),
      ],
      invoke
    );

    const result = await source({ tagIds: REQUESTED_TAG_IDS });

    expect(invoke).not.toHaveBeenCalled();
    expect(result).toEqual({ sections: [], pillars: [] });
  });

  it('sends the expanded ids rather than the requested ids to each carrier', async () => {
    const expand = vi.fn<TagExpansionInvoker>(async () => expanded());
    const invoke = vi.fn<TaggedListInvoker>(async () => ok({ items: [], nextCursor: null }));
    const source = federator([snapshot('finance')], invoke, { expand });

    await source({ tagIds: REQUESTED_TAG_IDS, limit: 25, cursor: 'next-page' });

    expect(expand).toHaveBeenCalledWith({ ids: REQUESTED_TAG_IDS });
    expect(invoke).toHaveBeenCalledWith('finance', {
      tagIds: EXPANDED_TAG_IDS,
      limit: 25,
      cursor: 'next-page',
    });
  });

  it('preserves unauthorized carrier status', async () => {
    const invoke: TaggedListInvoker = async () => ({
      kind: 'unauthorized',
      pillar: 'finance',
    });
    const source = federator([snapshot('finance')], invoke);

    const result = await source({ tagIds: REQUESTED_TAG_IDS });

    expect(result.sections).toEqual([]);
    expect(result.pillars).toEqual([{ pillarId: 'finance', status: 'unauthorized' }]);
  });
});
