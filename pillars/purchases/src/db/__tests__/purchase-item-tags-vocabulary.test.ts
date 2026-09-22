/**
 * The distinct item tags in use, as a "browse by tag" chooser reads them.
 *
 * The failure this is written against is a vocabulary ordered by luck: a
 * tag used once sorting ahead of one used a hundred times because it was
 * written first. Every case names an order that would only pass by
 * accident under a wrong sort, not just a set of tags.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  confirmItemClassification,
  createPurchase,
  getPurchase,
  listTagVocabulary,
  TAG_VOCABULARY_LIMIT,
} from '../index.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

function seedTaggedLine(checksum: string, tags: readonly string[]): void {
  const purchaseId = createPurchase(
    opened.db,
    amazonOrder({
      checksum,
      sourceOrderId: checksum,
      items: [
        {
          ref: 'i0',
          name: 'Line',
          sku: null,
          unitPriceCents: 1000,
          lineTotalCents: 1000,
        },
      ],
    })
  );
  const itemId = getPurchase(opened.db, purchaseId)?.items[0]?.item.id;
  if (itemId === undefined) throw new Error('the seeded order has no line');
  confirmItemClassification(opened.db, purchaseId, itemId, { tags });
}

describe('listTagVocabulary', () => {
  it('answers empty rather than an error when nothing is tagged', () => {
    expect(listTagVocabulary(opened.db)).toEqual([]);
  });

  it('orders by item count descending', () => {
    seedTaggedLine('a', ['snack']);
    seedTaggedLine('b', ['snack']);
    seedTaggedLine('c', ['drink']);

    expect(listTagVocabulary(opened.db)).toEqual(['snack', 'drink']);
  });

  it('breaks a tie between equally-used tags alphabetically, so the answer is stable', () => {
    seedTaggedLine('a', ['zeta']);
    seedTaggedLine('b', ['alpha']);

    expect(listTagVocabulary(opened.db)).toEqual(['alpha', 'zeta']);
  });

  it('caps the vocabulary rather than returning every tag ever used', () => {
    for (let index = 0; index < TAG_VOCABULARY_LIMIT + 5; index += 1) {
      seedTaggedLine(`c${String(index)}`, [`tag-${String(index)}`]);
    }

    expect(listTagVocabulary(opened.db)).toHaveLength(TAG_VOCABULARY_LIMIT);
  });

  it('honours a caller-supplied limit smaller than the default', () => {
    seedTaggedLine('a', ['snack']);
    seedTaggedLine('b', ['drink']);

    expect(listTagVocabulary(opened.db, 1)).toEqual(['drink']);
  });
});
