/**
 * Confirming a line's classification.
 *
 * The properties worth holding are all about what a *later* reader can
 * conclude. A confirmed value must be distinguishable from a proposed one,
 * a retraction must leave nothing behind that still reads as a decision,
 * and a wrong order id must never be able to reach a line it does not own.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  confirmItemClassification,
  createPurchase,
  getPurchase,
  InvalidIngestPayloadError,
  listItemsByTag,
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

/** An unclassified line — the state every ingested row starts in. */
function seedLine(overrides: Parameters<typeof amazonOrder>[0] = {}): {
  purchaseId: string;
  itemId: string;
} {
  const purchaseId = createPurchase(
    opened.db,
    amazonOrder({
      items: [
        {
          name: 'Robot vacuum',
          sku: { value: 'B0ROBOT', scheme: 'asin' },
          unitPriceCents: 79900,
          lineTotalCents: 79900,
        },
      ],
      ...overrides,
    })
  );
  const itemId = getPurchase(opened.db, purchaseId)?.items[0]?.item.id;
  if (itemId === undefined) throw new Error('the seeded order has no line');
  return { purchaseId, itemId };
}

/** Write a proposal the way the classification pass does: value, no marker. */
function proposeKind(itemId: string, kind: string): void {
  opened.raw
    .prepare(`UPDATE purchase_items SET kind = ?, kind_confirmed_at = NULL WHERE id = ?`)
    .run(kind, itemId);
}

describe('confirming a kind', () => {
  it('turns a proposal into a judgement without changing the value', () => {
    const { purchaseId, itemId } = seedLine();
    proposeKind(itemId, 'durable');

    const before = getPurchase(opened.db, purchaseId)?.items[0]?.item;
    expect(before).toMatchObject({ kind: 'durable', kindConfirmedAt: null });

    const after = confirmItemClassification(opened.db, purchaseId, itemId, { kind: 'durable' });
    expect(after?.item.kind).toBe('durable');
    expect(after?.item.kindConfirmedAt).not.toBeNull();
  });

  it('overwrites a wrong proposal and marks the correction as a decision', () => {
    const { purchaseId, itemId } = seedLine();
    proposeKind(itemId, 'consumable');

    const after = confirmItemClassification(opened.db, purchaseId, itemId, { kind: 'durable' });
    expect(after?.item.kind).toBe('durable');
    expect(after?.item.kindConfirmedAt).not.toBeNull();
  });

  it('retracts to unclassified rather than to a different wrong answer', () => {
    const { purchaseId, itemId } = seedLine();
    confirmItemClassification(opened.db, purchaseId, itemId, { kind: 'durable' });

    const after = confirmItemClassification(opened.db, purchaseId, itemId, { kind: null });
    // Both cleared. A marker outliving its value would read as "a human
    // decided this line has no kind", which is not a state that exists.
    expect(after?.item).toMatchObject({ kind: null, kindConfirmedAt: null });
  });

  it('leaves the kind alone when the body does not mention it', () => {
    const { purchaseId, itemId } = seedLine();
    confirmItemClassification(opened.db, purchaseId, itemId, { kind: 'durable' });

    const after = confirmItemClassification(opened.db, purchaseId, itemId, { tags: ['appliance'] });
    expect(after?.item.kind).toBe('durable');
    expect(after?.item.kindConfirmedAt).not.toBeNull();
  });
});

describe('confirming tags', () => {
  it('writes them asserted, so a reader can tell them from proposals', () => {
    const { purchaseId, itemId } = seedLine();
    const after = confirmItemClassification(opened.db, purchaseId, itemId, {
      tags: ['appliance', 'cleaning'],
    });
    expect(after?.tags.map((tag) => tag.tag)).toEqual(['appliance', 'cleaning']);
    for (const tag of after?.tags ?? []) expect(tag.confirmedAt).not.toBeNull();
  });

  it('replaces the set outright, which is how a proposal gets declined', () => {
    const { purchaseId, itemId } = seedLine();
    opened.raw
      .prepare(
        `INSERT INTO purchase_item_tags (item_id, tag, confirmed_at) VALUES (?, 'snack', NULL)`
      )
      .run(itemId);

    const after = confirmItemClassification(opened.db, purchaseId, itemId, { tags: ['appliance'] });
    // Merging would make `snack` unrejectable: there would be no body that
    // means "not that one".
    expect(after?.tags.map((tag) => tag.tag)).toEqual(['appliance']);
  });

  it('clears every tag when handed an empty list', () => {
    const { purchaseId, itemId } = seedLine();
    confirmItemClassification(opened.db, purchaseId, itemId, { tags: ['appliance'] });
    expect(confirmItemClassification(opened.db, purchaseId, itemId, { tags: [] })?.tags).toEqual(
      []
    );
  });

  it('leaves tags alone when the body does not mention them', () => {
    const { purchaseId, itemId } = seedLine();
    confirmItemClassification(opened.db, purchaseId, itemId, { tags: ['appliance'] });

    const after = confirmItemClassification(opened.db, purchaseId, itemId, { kind: 'durable' });
    // Absent must not mean empty, or confirming a kind silently discards
    // every tag a proposal pass put there.
    expect(after?.tags.map((tag) => tag.tag)).toEqual(['appliance']);
  });

  it('rejects a tag that is not a lower-case slug', () => {
    const { purchaseId, itemId } = seedLine();
    expect(() =>
      confirmItemClassification(opened.db, purchaseId, itemId, { tags: ['Appliance'] })
    ).toThrow(InvalidIngestPayloadError);
  });

  it('rejects a body that states nothing', () => {
    // An empty confirmation would read as success and change nothing, which
    // is the shape of a caller bug that never surfaces.
    const { purchaseId, itemId } = seedLine();
    expect(() => confirmItemClassification(opened.db, purchaseId, itemId, {})).toThrow(
      InvalidIngestPayloadError
    );
  });

  it('surfaces the confirmation through the cross-order tag query', () => {
    const { purchaseId, itemId } = seedLine();
    confirmItemClassification(opened.db, purchaseId, itemId, { tags: ['appliance'] });

    const found = listItemsByTag(opened.db, 'appliance');
    expect(found).toHaveLength(1);
    expect(found[0]?.item.id).toBe(itemId);
    expect(found[0]?.confirmedAt).not.toBeNull();
  });
});

describe('addressing a line', () => {
  it('refuses an item id that belongs to a different order', () => {
    const first = seedLine();
    const second = seedLine({ checksum: 'second', sourceOrderId: 'second' });

    // Silently succeeding here would let a mistyped order id mutate someone
    // else's line, and both ids are random UUIDs so nothing looks wrong.
    expect(
      confirmItemClassification(opened.db, first.purchaseId, second.itemId, { kind: 'durable' })
    ).toBeUndefined();

    const untouched = getPurchase(opened.db, second.purchaseId)?.items[0]?.item;
    expect(untouched?.kind).toBeNull();
  });

  it('refuses an unknown line without writing anything', () => {
    const { purchaseId } = seedLine();
    expect(
      confirmItemClassification(opened.db, purchaseId, 'no-such-item', { tags: ['appliance'] })
    ).toBeUndefined();
    expect(listItemsByTag(opened.db, 'appliance')).toEqual([]);
  });
});
