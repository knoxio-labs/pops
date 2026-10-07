import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchase, getPurchase } from '../../db/index.js';
import { sharedTagCache } from '../../db/schema.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { SharedTagCacheRefreshOutcome } from '../cron/refresh-shared-tags.js';

const { requestOn } = createTestTransport();

const TAG_A = '00000000-0000-4000-8000-000000000001';
const TAG_B = '00000000-0000-4000-8000-000000000002';
const API_KEY = 'pops_sa_tagged-api-test.fake-secret';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let itemId: string;

function app(
  verify?: ServiceAccountVerifier,
  refreshSharedTagCache?: () => Promise<SharedTagCacheRefreshOutcome>
): Express {
  return createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3013',
    ...(verify === undefined ? {} : { serviceAccountVerifier: verify }),
    ...(refreshSharedTagCache === undefined ? {} : { refreshSharedTagCache }),
  });
}

function seedSharedTags(...tagIds: readonly string[]): void {
  opened.db
    .insert(sharedTagCache)
    .values(
      tagIds.map((tagId, index) => ({
        tagId,
        facet: 'trip',
        name: `Shared tag ${String(index)}`,
        archived: false,
        mergedIntoId: null,
        fetchedAt: '2026-10-03T00:00:00.000Z',
      }))
    )
    .run();
}

function assignmentPath(entityId: string, tagId: string): string {
  return `/tagged/purchase-item/${entityId}/tags/${tagId}`;
}

function authenticatedWith(scopes: readonly string[]): ServiceAccountVerifier {
  const verification: ServiceAccountVerification = {
    outcome: 'authenticated',
    principal: { id: 'sa_tagged_test', name: 'tagged route test key', scopes },
  };
  return () => Promise.resolve(verification);
}

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  const purchaseId = createPurchase(
    opened.db,
    amazonOrder({
      checksum: 'shared-tags-http',
      orderedAt: '2026-03-04T05:06:07Z',
      items: [
        {
          ref: 'line-1',
          name: 'Tagged Purchase Line',
          sku: null,
          unitPriceCents: 1299,
          lineTotalCents: 1299,
        },
      ],
    })
  );
  const purchase = getPurchase(opened.db, purchaseId);
  const firstItem = purchase?.items[0]?.item;
  if (firstItem === undefined) throw new Error('seeded purchase line was not readable');
  itemId = firstItem.id;
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  __resetPillarRegistryCache();
});

describe('Purchases tagged routes', () => {
  it('lists purchase items with the shared-tag carrier projection', async () => {
    seedSharedTags(TAG_A, TAG_B);
    const server = app();
    const transport = requestOn(server);
    await transport.put(assignmentPath(itemId, TAG_A));
    await transport.put(assignmentPath(itemId, TAG_B));

    const response = await transport.post('/tagged/query').send({
      tagIds: [TAG_B, TAG_A],
      limit: 10,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        {
          uri: `pops://purchases/purchase-item/${itemId}`,
          entityType: 'purchase-item',
          title: 'Tagged Purchase Line',
          tagIds: [TAG_A, TAG_B],
          date: '2026-03-04T05:06:07.000Z',
          amountCents: 1299,
        },
      ],
      nextCursor: null,
    });
  });

  it('rejects a malformed continuation cursor', async () => {
    const response = await requestOn(app())
      .post('/tagged/query')
      .send({ tagIds: [TAG_A], limit: 10, cursor: 'not-a-cursor' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('purchases.request.invalid_cursor');
  });

  it('attaches and detaches idempotently while returning the full current tag set', async () => {
    seedSharedTags(TAG_A, TAG_B);
    const transport = requestOn(app());

    const firstAttach = await transport.put(assignmentPath(itemId, TAG_A));
    const secondAttach = await transport.put(assignmentPath(itemId, TAG_B));
    const repeatedAttach = await transport.put(assignmentPath(itemId, TAG_A));
    const firstDetach = await transport.delete(assignmentPath(itemId, TAG_B));
    const repeatedDetach = await transport.delete(assignmentPath(itemId, TAG_B));

    expect(firstAttach.status).toBe(200);
    expect(firstAttach.body).toEqual({ tagIds: [TAG_A] });
    expect(secondAttach.body).toEqual({ tagIds: [TAG_A, TAG_B] });
    expect(repeatedAttach.body).toEqual({ tagIds: [TAG_A, TAG_B] });
    expect(firstDetach.status).toBe(200);
    expect(firstDetach.body).toEqual({ tagIds: [TAG_A] });
    expect(repeatedDetach.body).toEqual({ tagIds: [TAG_A] });
  });

  it('returns 404 when an assignment names an unknown purchase item', async () => {
    seedSharedTags(TAG_A);
    const transport = requestOn(app());

    const response = await transport.put(assignmentPath('missing-item', TAG_A));
    const detach = await transport.delete(assignmentPath('missing-item', TAG_A));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('purchases.resource.not_found');
    expect(detach.status).toBe(404);
    expect(detach.body.code).toBe('purchases.resource.not_found');
  });

  it('returns 400 when an assignment names an uncached shared tag', async () => {
    const response = await requestOn(app()).put(assignmentPath(itemId, 'uncached-tag'));
    const detach = await requestOn(app()).delete(assignmentPath(itemId, 'uncached-tag'));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('purchases.shared_tag.unknown_shared_tag');
    expect(detach.status).toBe(400);
    expect(detach.body.code).toBe('purchases.shared_tag.unknown_shared_tag');
  });

  it('refreshes the shared-tag cache once before retrying an uncached assignment', async () => {
    const refresh = vi
      .fn<() => Promise<SharedTagCacheRefreshOutcome>>()
      .mockImplementation(async () => {
        seedSharedTags(TAG_A);
        return { kind: 'refreshed', count: 1 };
      });

    const response = await requestOn(app(undefined, refresh)).put(assignmentPath(itemId, TAG_A));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ tagIds: [TAG_A] });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('preserves the unknown-tag response when the cache refresh fails', async () => {
    const refresh = vi
      .fn<() => Promise<SharedTagCacheRefreshOutcome>>()
      .mockRejectedValue(new Error('tags unavailable'));

    const response = await requestOn(app(undefined, refresh)).put(assignmentPath(itemId, TAG_A));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('purchases.shared_tag.unknown_shared_tag');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('preserves the unknown-tag response when a refresh returns unavailable', async () => {
    const refresh = vi
      .fn<() => Promise<SharedTagCacheRefreshOutcome>>()
      .mockResolvedValue({ kind: 'unavailable', reason: 'unavailable' });

    const response = await requestOn(app(undefined, refresh)).put(assignmentPath(itemId, TAG_A));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('purchases.shared_tag.unknown_shared_tag');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('preserves the unknown-tag response when a successful refresh still lacks the tag', async () => {
    const refresh = vi
      .fn<() => Promise<SharedTagCacheRefreshOutcome>>()
      .mockResolvedValue({ kind: 'refreshed', count: 0 });

    const response = await requestOn(app(undefined, refresh)).put(assignmentPath(itemId, TAG_A));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('purchases.shared_tag.unknown_shared_tag');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('rejects a query with more than 500 tag ids before searching', async () => {
    const response = await requestOn(app())
      .post('/tagged/query')
      .send({ tagIds: Array.from({ length: 501 }, (_, index) => `tag-${String(index)}`) });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('purchases.request.invalid');
  });

  it('requires the purchases.tagged grant for a presented service-account key', async () => {
    const response = await requestOn(app(authenticatedWith(['purchases.purchase'])))
      .put(assignmentPath(itemId, TAG_A))
      .set('x-api-key', API_KEY);

    expect(response.status).toBe(403);
  });
});
