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
  listTagVocabularyPage,
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

  it('orders by item count descending, and reports each count', () => {
    seedTaggedLine('a', ['snack']);
    seedTaggedLine('b', ['snack']);
    seedTaggedLine('c', ['drink']);

    expect(listTagVocabulary(opened.db)).toEqual([
      { tag: 'snack', count: 2 },
      { tag: 'drink', count: 1 },
    ]);
  });

  it('breaks a tie between equally-used tags alphabetically, so the answer is stable', () => {
    seedTaggedLine('a', ['zeta']);
    seedTaggedLine('b', ['alpha']);

    expect(listTagVocabulary(opened.db)).toEqual([
      { tag: 'alpha', count: 1 },
      { tag: 'zeta', count: 1 },
    ]);
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

    expect(listTagVocabulary(opened.db, 1)).toEqual([{ tag: 'drink', count: 1 }]);
  });

  it('finds a search match beyond the legacy 100-tag vocabulary cap', () => {
    const tags = Array.from(
      { length: TAG_VOCABULARY_LIMIT + 5 },
      (_, index) => `tag-${String(index).padStart(3, '0')}`
    );
    seedTaggedLine('page-match', [...tags, 'zz-match']);

    expect(listTagVocabulary(opened.db)).not.toContainEqual({ tag: 'zz-match', count: 1 });
    expect(listTagVocabularyPage(opened.db, { search: 'match', limit: 1 })).toEqual({
      tags: [{ tag: 'zz-match', count: 1 }],
      nextCursor: null,
    });
  });

  it('does not treat underscores in a search as SQL wildcards', () => {
    seedTaggedLine('hyphen', ['fifty-off']);
    seedTaggedLine('other', ['fifty-x-off']);

    const page = listTagVocabularyPage(opened.db, { search: '_', limit: 10 });

    expect(page?.tags).toEqual([]);
  });

  it('binds a tag cursor to its search and continues in count/tag order', () => {
    seedTaggedLine('page-a', ['coffee-alpha']);
    seedTaggedLine('page-b', ['coffee-beta']);
    seedTaggedLine('page-c', ['tea']);
    const first = listTagVocabularyPage(opened.db, { search: 'coffee', limit: 1 });

    const next = listTagVocabularyPage(opened.db, {
      search: 'coffee',
      cursor: first?.nextCursor ?? undefined,
      limit: 1,
    });
    const wrongSearch = listTagVocabularyPage(opened.db, {
      search: 'tea',
      cursor: first?.nextCursor ?? undefined,
      limit: 1,
    });

    expect(first?.tags).toEqual([{ tag: 'coffee-alpha', count: 1 }]);
    expect(next?.tags).toEqual([{ tag: 'coffee-beta', count: 1 }]);
    expect(next?.nextCursor).toBeNull();
    expect(wrongSearch).toBeNull();
  });
});
