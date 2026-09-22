/**
 * Editing a saved purchase: the lock policy, kept originals, and the
 * amended rule that removing an inventory-linked line is allowed.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPurchase,
  getPurchase,
  InvalidIngestPayloadError,
  purchaseItemUnits,
  PurchaseLockedError,
  PurchaseStaleError,
  setPurchaseStatus,
  updatePurchase,
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

function seedOrder(overrides: Parameters<typeof amazonOrder>[0] = {}) {
  const purchaseId = createPurchase(
    opened.db,
    amazonOrder({
      totalCents: 1000,
      items: [{ name: 'Widget', unitPriceCents: 1000, lineTotalCents: 1000, quantity: 1 }],
      ...overrides,
    })
  );
  const detail = getPurchase(opened.db, purchaseId);
  if (detail === undefined) throw new Error('seed purchase vanished');
  const itemId = detail.items[0]?.item.id;
  if (itemId === undefined) throw new Error('seed purchase has no line');
  return { purchaseId, itemId, updatedAt: detail.purchase.updatedAt };
}

describe('updatePurchase — the lock policy', () => {
  it.each([
    { merchantEntityId: 'another-merchant' },
    { merchantEntityName: 'Another merchant' },
    { orderedAt: '2026-09-22T00:00:00Z' },
  ])('refuses a locked header edit without changing the purchase: %j', (change) => {
    const { purchaseId, itemId } = seedOrder();
    setPurchaseStatus(opened.db, purchaseId, 'linked');
    const before = getPurchase(opened.db, purchaseId);
    expect(() =>
      updatePurchase(opened.db, purchaseId, {
        ...change,
        lines: [{ id: itemId, name: 'Widget', quantity: 1, lineTotalCents: 1000 }],
        expectedUpdatedAt: before?.purchase.updatedAt ?? '',
      })
    ).toThrow(PurchaseLockedError);
    expect(getPurchase(opened.db, purchaseId)).toEqual(before);
  });

  it('records changed merchant, date and quantity originals across later edits', () => {
    const { purchaseId, itemId, updatedAt } = seedOrder({ merchantEntityName: 'Original shop' });
    const before = getPurchase(opened.db, purchaseId);
    const first = updatePurchase(
      opened.db,
      purchaseId,
      {
        merchantEntityName: 'Second shop',
        orderedAt: '2026-09-21T00:00:00Z',
        lines: [{ id: itemId, name: 'Widget', quantity: 2, lineTotalCents: 1000 }],
        expectedUpdatedAt: updatedAt,
      },
      '2026-09-22T01:00:00Z'
    );
    const second = updatePurchase(
      opened.db,
      purchaseId,
      {
        merchantEntityName: 'Third shop',
        orderedAt: '2026-09-22T00:00:00Z',
        lines: [{ id: itemId, name: 'Widget', quantity: 3, lineTotalCents: 1000 }],
        expectedUpdatedAt: first?.purchase.updatedAt ?? '',
      },
      '2026-09-22T02:00:00Z'
    );
    expect(second?.edit?.changes).toEqual(
      expect.arrayContaining([
        { field: 'merchant', itemId: null, original: 'Original shop', current: 'Third shop' },
        {
          field: 'orderedOn',
          itemId: null,
          original: before?.purchase.orderedAt,
          current: '2026-09-22T00:00:00Z',
        },
        { field: 'lineQuantity', itemId, original: '1', current: '3' },
      ])
    );
    expect(second?.edit?.changes).toHaveLength(3);
  });

  it('rejects a foreign line id without writing either purchase', () => {
    const { purchaseId, updatedAt } = seedOrder();
    const before = getPurchase(opened.db, purchaseId);
    expect(() =>
      updatePurchase(opened.db, purchaseId, {
        lines: [{ id: 'foreign-line', name: 'Widget', quantity: 1, lineTotalCents: 1000 }],
        expectedUpdatedAt: updatedAt,
      })
    ).toThrow(InvalidIngestPayloadError);
    expect(getPurchase(opened.db, purchaseId)).toEqual(before);
  });

  it('renames a line on a linked purchase and records the original', () => {
    const { purchaseId, itemId } = seedOrder();
    setPurchaseStatus(opened.db, purchaseId, 'linked');
    const linked = getPurchase(opened.db, purchaseId);

    const detail = updatePurchase(opened.db, purchaseId, {
      lines: [{ id: itemId, name: 'Gadget', quantity: 1, lineTotalCents: 1000 }],
      expectedUpdatedAt: linked?.purchase.updatedAt ?? '',
    });

    expect(detail?.items[0]?.item.name).toBe('Gadget');
    expect(detail?.edit?.changes).toEqual([
      { field: 'lineName', itemId, original: 'Widget', current: 'Gadget' },
    ]);
  });

  it('refuses to change the total on a linked purchase and writes nothing', () => {
    const { purchaseId, itemId } = seedOrder();
    setPurchaseStatus(opened.db, purchaseId, 'linked');
    const linked = getPurchase(opened.db, purchaseId);

    expect(() =>
      updatePurchase(opened.db, purchaseId, {
        totalCents: 2000,
        lines: [{ id: itemId, name: 'Widget', quantity: 1, lineTotalCents: 2000 }],
        expectedUpdatedAt: linked?.purchase.updatedAt ?? '',
      })
    ).toThrow(PurchaseLockedError);

    const after = getPurchase(opened.db, purchaseId);
    expect(after?.purchase.totalCents).toBe(1000);
    expect(after?.edit).toBeNull();
  });

  it('allows the same total change on an awaiting_settlement purchase', () => {
    const { purchaseId, itemId, updatedAt } = seedOrder();

    const detail = updatePurchase(opened.db, purchaseId, {
      totalCents: 2000,
      lines: [{ id: itemId, name: 'Widget', quantity: 1, lineTotalCents: 2000 }],
      expectedUpdatedAt: updatedAt,
    });

    expect(detail?.purchase.totalCents).toBe(2000);
  });

  it('keeps the first original across a second edit of the same field', () => {
    const { purchaseId, itemId, updatedAt } = seedOrder();

    const first = updatePurchase(opened.db, purchaseId, {
      lines: [{ id: itemId, name: 'Gadget', quantity: 1, lineTotalCents: 1000 }],
      expectedUpdatedAt: updatedAt,
    });
    const second = updatePurchase(opened.db, purchaseId, {
      lines: [{ id: itemId, name: 'Gizmo', quantity: 1, lineTotalCents: 1000 }],
      expectedUpdatedAt: first?.purchase.updatedAt ?? '',
    });

    expect(second?.edit?.changes).toEqual([
      { field: 'lineName', itemId, original: 'Widget', current: 'Gizmo' },
    ]);
  });

  it('refuses a stale expectedUpdatedAt and writes nothing', () => {
    const { purchaseId, itemId, updatedAt } = seedOrder();
    updatePurchase(
      opened.db,
      purchaseId,
      {
        lines: [{ id: itemId, name: 'Gadget', quantity: 1, lineTotalCents: 1000 }],
        expectedUpdatedAt: updatedAt,
      },
      new Date(Date.parse(updatedAt) + 1000).toISOString()
    );

    expect(() =>
      updatePurchase(opened.db, purchaseId, {
        lines: [{ id: itemId, name: 'Gizmo', quantity: 1, lineTotalCents: 1000 }],
        expectedUpdatedAt: updatedAt,
      })
    ).toThrow(PurchaseStaleError);

    const after = getPurchase(opened.db, purchaseId);
    expect(after?.items[0]?.item.name).toBe('Gadget');
  });

  it('removes a line with an inventory link, deletes its units, and keeps the URI in the edit record', () => {
    const { purchaseId, itemId, updatedAt } = seedOrder();
    opened.db
      .insert(purchaseItemUnits)
      .values({ itemId, inventoryItemUri: 'pops://inventory/item/abc123' })
      .run();

    const detail = updatePurchase(opened.db, purchaseId, {
      totalCents: 0,
      lines: [],
      expectedUpdatedAt: updatedAt,
    });

    expect(detail?.items).toEqual([]);
    const remainingUnits = opened.db
      .select()
      .from(purchaseItemUnits)
      .where(eq(purchaseItemUnits.itemId, itemId))
      .all();
    expect(remainingUnits).toEqual([]);
    const removedChange = detail?.edit?.changes.find((c) => c.field === 'lineRemoved');
    expect(removedChange?.itemId).toBe(itemId);
    expect(removedChange?.current).toBeNull();
    expect(removedChange?.original).toContain('pops://inventory/item/abc123');
  });

  it('a line rename keeps its tags', () => {
    const purchaseId = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 1000,
        items: [
          {
            name: 'Widget',
            unitPriceCents: 1000,
            lineTotalCents: 1000,
            quantity: 1,
            tags: ['fruit'],
          },
        ],
      })
    );
    const before = getPurchase(opened.db, purchaseId);
    const itemId = before?.items[0]?.item.id as string;

    const detail = updatePurchase(opened.db, purchaseId, {
      lines: [{ id: itemId, name: 'Gadget', quantity: 1, lineTotalCents: 1000 }],
      expectedUpdatedAt: before?.purchase.updatedAt ?? '',
    });

    expect(detail?.items[0]?.tags.map((t) => t.tag)).toEqual(['fruit']);
  });

  it('refuses a total that no longer adds up', () => {
    const { purchaseId, itemId, updatedAt } = seedOrder();

    expect(() =>
      updatePurchase(opened.db, purchaseId, {
        lines: [{ id: itemId, name: 'Widget', quantity: 1, lineTotalCents: 1500 }],
        expectedUpdatedAt: updatedAt,
      })
    ).toThrow(InvalidIngestPayloadError);

    const after = getPurchase(opened.db, purchaseId);
    expect(after?.items[0]?.item.lineTotalCents).toBe(1000);
  });
});
