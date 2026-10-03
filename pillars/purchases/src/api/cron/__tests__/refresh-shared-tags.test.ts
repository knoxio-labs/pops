import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openTempDb } from '../../../db/__tests__/helpers.js';
import { sharedTagCache } from '../../../db/schema.js';
import { isKnownSharedTag, replaceSharedTagCache } from '../../../db/services/shared-tag-cache.js';
import { createTagsClient, type SharedTagFetch, type TagsRouter } from '../../tags/client.js';
import { startSharedTagCacheRefreshWorker } from '../refresh-shared-tags.js';

import type { PillarHandle } from '@pops/pillar-sdk/server';

import type { OpenedPurchasesDb } from '../../../db/index.js';
import type { SharedTagCacheRefreshHandle } from '../refresh-shared-tags.js';

const TAG_A = '00000000-0000-4000-8000-000000000001';
const TAG_B = '00000000-0000-4000-8000-000000000002';
const TAG_C = '00000000-0000-4000-8000-000000000003';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
const workers: SharedTagCacheRefreshHandle[] = [];

function tag(id: string, name: string, archived = false, mergedIntoId: string | null = null) {
  return { id, facet: 'trip', name, archived, mergedIntoId };
}

function cacheRows() {
  return opened.db
    .select()
    .from(sharedTagCache)
    .all()
    .toSorted((left, right) => left.tagId.localeCompare(right.tagId));
}

function startWorker(
  fetchAll: () => Promise<SharedTagFetch>,
  options: { now?: () => Date; warn?: (...args: unknown[]) => void } = {}
) {
  const worker = startSharedTagCacheRefreshWorker({
    db: opened.db,
    client: { fetchAll },
    intervalMs: 60_000,
    ...(options.warn === undefined
      ? {}
      : {
          logger: {
            warn: options.warn as (message: string, context?: Record<string, unknown>) => void,
          },
        }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  worker.stop();
  workers.push(worker);
  return worker;
}

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
});

afterEach(async () => {
  for (const worker of workers.splice(0)) {
    worker.stop();
    await worker.drain();
  }
  cleanup();
  vi.restoreAllMocks();
});

describe('the shared tag cache refresh worker', () => {
  it('fills the cache from one complete vocabulary response', async () => {
    const fetchedAt = '2026-10-03T00:00:00.000Z';
    const worker = startWorker(
      async () => ({
        kind: 'ok',
        tags: [tag(TAG_A, 'Japan trip'), tag(TAG_B, 'Pottery', true)],
      }),
      {
        now: () => new Date(fetchedAt),
      }
    );

    await expect(worker.runOnce()).resolves.toEqual({ kind: 'refreshed', count: 2 });
    expect(cacheRows()).toEqual([
      {
        tagId: TAG_A,
        facet: 'trip',
        name: 'Japan trip',
        archived: false,
        mergedIntoId: null,
        fetchedAt,
      },
      {
        tagId: TAG_B,
        facet: 'trip',
        name: 'Pottery',
        archived: true,
        mergedIntoId: null,
        fetchedAt,
      },
    ]);
  });

  it('replaces renamed and archived entries instead of retaining stale vocabulary', async () => {
    const fetchAll = vi
      .fn<() => Promise<SharedTagFetch>>()
      .mockResolvedValueOnce({
        kind: 'ok',
        tags: [tag(TAG_A, 'Japan'), tag(TAG_B, 'Crafts'), tag(TAG_C, 'Old')],
      })
      .mockResolvedValueOnce({
        kind: 'ok',
        tags: [tag(TAG_A, 'Japan trip'), tag(TAG_B, 'Crafts', true, TAG_A)],
      });
    const times = [new Date('2026-10-02T00:00:00.000Z'), new Date('2026-10-03T00:00:00.000Z')];
    const worker = startWorker(fetchAll, {
      now: () => times.shift() ?? new Date('2026-10-03T00:00:00.000Z'),
    });

    await worker.runOnce();
    await expect(worker.runOnce()).resolves.toEqual({ kind: 'refreshed', count: 2 });

    expect(cacheRows()).toEqual([
      {
        tagId: TAG_A,
        facet: 'trip',
        name: 'Japan trip',
        archived: false,
        mergedIntoId: null,
        fetchedAt: '2026-10-03T00:00:00.000Z',
      },
      {
        tagId: TAG_B,
        facet: 'trip',
        name: 'Crafts',
        archived: true,
        mergedIntoId: TAG_A,
        fetchedAt: '2026-10-03T00:00:00.000Z',
      },
    ]);
    expect(isKnownSharedTag(opened.db, TAG_C)).toBe(false);
  });

  const failures: readonly [string, Exclude<SharedTagFetch, { readonly kind: 'ok' }>][] = [
    ['unavailable', { kind: 'unavailable', reason: 'unavailable' }],
    ['unauthorized', { kind: 'unauthorized' }],
    ['no-credential', { kind: 'no-credential' }],
  ];

  it.each(failures)(
    '%s leaves the last complete cache unchanged and is reported by kind',
    async (_label, failure) => {
      replaceSharedTagCache(
        opened.db,
        [{ tagId: TAG_A, facet: 'trip', name: 'Existing', archived: false, mergedIntoId: null }],
        '2026-10-02T00:00:00.000Z'
      );
      const before = cacheRows();
      const warn = vi.fn();
      const worker = startWorker(async () => failure, { warn });

      await expect(worker.runOnce()).resolves.toEqual(failure);
      expect(cacheRows()).toEqual(before);
      expect(warn).toHaveBeenCalledWith('purchases shared tag cache refresh skipped', {
        outcome: failure.kind,
        ...(failure.kind === 'unavailable' ? { reason: failure.reason } : {}),
      });
    }
  );

  it('keeps the cache intact when a successful HTTP response is malformed', async () => {
    replaceSharedTagCache(
      opened.db,
      [{ tagId: TAG_A, facet: 'trip', name: 'Existing', archived: false, mergedIntoId: null }],
      '2026-10-02T00:00:00.000Z'
    );
    const before = cacheRows();
    const malformedHandle = {
      tags: {
        list: async () => ({
          kind: 'ok',
          value: { tags: [{ ...tag(TAG_B, ''), archived: false }] },
        }),
      },
    } as unknown as PillarHandle<TagsRouter>;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const worker = startWorker(() => createTagsClient(() => malformedHandle).fetchAll());

    await expect(worker.runOnce()).resolves.toEqual({
      kind: 'unavailable',
      reason: 'contract-mismatch',
    });
    expect(cacheRows()).toEqual(before);
  });
});
