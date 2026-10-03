import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../__tests__/helpers.js';
import { createPurchase, getPurchase } from '../../index.js';
import { purchaseItemSharedTags, sharedTagCache } from '../../schema.js';
import { confirmItemClassification } from '../purchase-item-mutations.js';
import { hasSharedTagId, listSharedTagIdsForItem } from '../purchase-item-shared-tag-state.js';
import {
  attachSharedTag,
  detachSharedTag,
  listItemsBySharedTagIds,
  PurchaseItemNotFoundForSharedTagError,
  UnknownSharedTagIdError,
} from '../purchase-item-shared-tags.js';
import { listItemsByTag, listTagVocabulary } from '../purchase-item-tags.js';

import type { OpenedPurchasesDb } from '../../index.js';

const TAG_A = '00000000-0000-4000-8000-000000000001';
const TAG_B = '00000000-0000-4000-8000-000000000002';
const TAG_C = '00000000-0000-4000-8000-000000000003';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

function seedSharedTags(...tagIds: readonly string[]): void {
  opened.db
    .insert(sharedTagCache)
    .values(
      tagIds.map((tagId, index) => ({
        tagId,
        facet: 'trip',
        name: 'Shared tag ' + String(index),
        archived: false,
        mergedIntoId: null,
        fetchedAt: '2026-10-03T00:00:00.000Z',
      }))
    )
    .run();
}

function seedItems(checksum: string, count: number): { purchaseId: string; itemIds: string[] } {
  const purchaseId = createPurchaseForTest(checksum, count);
  const purchase = getPurchaseForTest(purchaseId);
  if (purchase === undefined) throw new Error('seeded purchase was not readable');
  return { purchaseId, itemIds: purchase.items.map(({ item }) => item.id) };
}

function createPurchaseForTest(checksum: string, count: number): string {
  return createPurchase(
    opened.db,
    amazonOrder({
      checksum,
      sourceOrderId: checksum,
      items: Array.from({ length: count }, (_, position) => ({
        ref: 'item-' + String(position),
        name: 'Line ' + String(position),
        sku: null,
        unitPriceCents: 1000,
        lineTotalCents: 1000,
      })),
    })
  );
}

function getPurchaseForTest(purchaseId: string) {
  return getPurchase(opened.db, purchaseId);
}

describe('shared tags on purchase items', () => {
  it('returns each item once with the requested shared ids it carries', () => {
    const { itemIds } = seedItems('shared-tags-multiple', 2);
    const firstId = itemIds[0];
    const secondId = itemIds[1];
    if (firstId === undefined || secondId === undefined) throw new Error('missing seeded item ids');

    seedSharedTags(TAG_A, TAG_B, TAG_C);
    attachSharedTag(opened.db, firstId, TAG_A);
    attachSharedTag(opened.db, firstId, TAG_B);
    attachSharedTag(opened.db, secondId, TAG_B);
    attachSharedTag(opened.db, secondId, TAG_C);

    const page = listItemsBySharedTagIds(opened.db, {
      tagIds: [TAG_B, TAG_A, TAG_B],
      limit: 10,
    });

    expect(
      page?.rows.map(({ item, orderedAt, tagIds }) => ({
        id: item.id,
        position: item.position,
        orderedAt,
        tagIds,
      }))
    ).toEqual([
      {
        id: firstId,
        position: 0,
        orderedAt: '2026-02-02T01:41:21.000Z',
        tagIds: [TAG_A, TAG_B],
      },
      { id: secondId, position: 1, orderedAt: '2026-02-02T01:41:21.000Z', tagIds: [TAG_B] },
    ]);
    expect(page?.nextCursor).toBeNull();
  });

  it('pages in listItemsByTag order with a stable keyset cursor', () => {
    const { itemIds } = seedItems('shared-tags-pages', 3);
    seedSharedTags(TAG_A);
    for (const itemId of itemIds) attachSharedTag(opened.db, itemId, TAG_A);

    const first = listItemsBySharedTagIds(opened.db, { tagIds: [TAG_A], limit: 1 });
    expect(first?.rows.map(({ item }) => item.id)).toEqual([itemIds[0]]);
    expect(first?.nextCursor).not.toBeNull();
    if (first === null || first.nextCursor === null) throw new Error('first page has no cursor');

    const second = listItemsBySharedTagIds(opened.db, {
      tagIds: [TAG_A],
      cursor: first.nextCursor,
      limit: 1,
    });
    expect(second?.rows.map(({ item }) => item.id)).toEqual([itemIds[1]]);
    expect(second?.nextCursor).not.toBeNull();
    if (second === null || second.nextCursor === null) throw new Error('second page has no cursor');

    const third = listItemsBySharedTagIds(opened.db, {
      tagIds: [TAG_A],
      cursor: second.nextCursor,
      limit: 1,
    });
    expect(third?.rows.map(({ item }) => item.id)).toEqual([itemIds[2]]);
    expect(third?.nextCursor).toBeNull();
  });

  it('binds the cursor to the requested tag-id set', () => {
    const { itemIds } = seedItems('shared-tags-filter-cursor', 2);
    seedSharedTags(TAG_A, TAG_B);
    for (const itemId of itemIds) attachSharedTag(opened.db, itemId, TAG_A);
    const first = listItemsBySharedTagIds(opened.db, { tagIds: [TAG_A, TAG_B], limit: 1 });
    if (first === null || first.nextCursor === null) throw new Error('first page has no cursor');

    expect(
      listItemsBySharedTagIds(opened.db, {
        tagIds: [TAG_B],
        cursor: first.nextCursor,
        limit: 1,
      })
    ).toBeNull();
  });

  it('attaches idempotently and treats an explicit attach as confirmed', () => {
    const { itemIds } = seedItems('shared-tags-attach', 1);
    const itemId = itemIds[0];
    if (itemId === undefined) throw new Error('missing seeded item id');
    seedSharedTags(TAG_A);

    const first = attachSharedTag(opened.db, itemId, TAG_A);
    const second = attachSharedTag(opened.db, itemId, TAG_A);
    const rows = opened.db.select().from(purchaseItemSharedTags).all();

    expect(second).toEqual(first);
    expect(first.confirmedAt).not.toBeNull();
    expect(rows).toHaveLength(1);
  });

  it('detaches idempotently', () => {
    const { itemIds } = seedItems('shared-tags-detach', 1);
    const itemId = itemIds[0];
    if (itemId === undefined) throw new Error('missing seeded item id');
    seedSharedTags(TAG_A);
    attachSharedTag(opened.db, itemId, TAG_A);

    expect(detachSharedTag(opened.db, itemId, TAG_A)).toBe(true);
    expect(detachSharedTag(opened.db, itemId, TAG_A)).toBe(false);
    expect(opened.db.select().from(purchaseItemSharedTags).all()).toEqual([]);
  });

  it('reads the current sorted assignment set and distinguishes missing items and cached tags', () => {
    const { itemIds } = seedItems('shared-tags-current-set', 1);
    const itemId = itemIds[0];
    if (itemId === undefined) throw new Error('missing seeded item id');
    seedSharedTags(TAG_A, TAG_B);
    attachSharedTag(opened.db, itemId, TAG_B);
    attachSharedTag(opened.db, itemId, TAG_A);

    expect(listSharedTagIdsForItem(opened.db, itemId)).toEqual([TAG_A, TAG_B]);
    expect(listSharedTagIdsForItem(opened.db, 'missing-item')).toBeNull();
    expect(hasSharedTagId(opened.db, TAG_A)).toBe(true);
    expect(hasSharedTagId(opened.db, 'uncached-tag')).toBe(false);
  });

  it('throws distinct typed errors for an unknown item and an uncached tag id', () => {
    const { itemIds } = seedItems('shared-tags-errors', 1);
    const itemId = itemIds[0];
    if (itemId === undefined) throw new Error('missing seeded item id');
    seedSharedTags(TAG_A);

    expect(() => attachSharedTag(opened.db, 'missing-item', TAG_A)).toThrow(
      PurchaseItemNotFoundForSharedTagError
    );
    expect(() => attachSharedTag(opened.db, itemId, 'unknown-tag-id')).toThrow(
      UnknownSharedTagIdError
    );
  });

  it('keeps the product-tag reads unchanged when shared-id rows are present', () => {
    const { purchaseId, itemIds } = seedItems('shared-tags-separation', 1);
    const itemId = itemIds[0];
    if (itemId === undefined) throw new Error('missing seeded item id');
    seedSharedTags(TAG_A, TAG_B);
    confirmItemClassification(opened.db, purchaseId, itemId, { tags: ['fruit'] });

    const itemsBefore = listItemsByTag(opened.db, 'fruit');
    const vocabularyBefore = listTagVocabulary(opened.db);
    attachSharedTag(opened.db, itemId, TAG_A);
    attachSharedTag(opened.db, itemId, TAG_B);

    expect(listItemsByTag(opened.db, 'fruit')).toEqual(itemsBefore);
    expect(listTagVocabulary(opened.db)).toEqual(vocabularyBefore);
    expect(listItemsByTag(opened.db, TAG_A).rows).toEqual([]);
    expect(listTagVocabulary(opened.db)).toEqual([{ tag: 'fruit', count: 1 }]);
  });
});
