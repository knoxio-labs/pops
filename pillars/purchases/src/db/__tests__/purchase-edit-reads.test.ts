/**
 * The edit summary `getPurchase` attaches to a detail read (POPS-4257).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPurchase, getPurchase, updatePurchase } from '../index.js';
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

describe('a purchase detail read carries the edit summary', () => {
  it('is null for a never-edited purchase', () => {
    const purchaseId = createPurchase(opened.db, amazonOrder());
    expect(getPurchase(opened.db, purchaseId)?.edit).toBeNull();
  });

  it('holds the original and the new name after a line rename', () => {
    const purchaseId = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 1000,
        items: [{ name: 'Widget', unitPriceCents: 1000, lineTotalCents: 1000 }],
      })
    );
    const before = getPurchase(opened.db, purchaseId);
    const itemId = before?.items[0]?.item.id as string;

    updatePurchase(opened.db, purchaseId, {
      lines: [{ id: itemId, name: 'Gadget', quantity: 1, lineTotalCents: 1000 }],
      expectedUpdatedAt: before?.purchase.updatedAt ?? '',
    });

    const after = getPurchase(opened.db, purchaseId);
    expect(after?.edit?.changes).toEqual([
      { field: 'lineName', itemId, original: 'Widget', current: 'Gadget' },
    ]);
  });

  it("a removed line's current is null", () => {
    const purchaseId = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 1000,
        items: [{ name: 'Widget', unitPriceCents: 1000, lineTotalCents: 1000 }],
      })
    );
    const before = getPurchase(opened.db, purchaseId);
    const itemId = before?.items[0]?.item.id as string;

    updatePurchase(opened.db, purchaseId, {
      totalCents: 0,
      lines: [],
      expectedUpdatedAt: before?.purchase.updatedAt ?? '',
    });

    const after = getPurchase(opened.db, purchaseId);
    const change = after?.edit?.changes.find((c) => c.field === 'lineRemoved');
    expect(change?.itemId).toBe(itemId);
    expect(change?.current).toBeNull();
  });

  it("an added line's original is null", () => {
    const purchaseId = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 1000,
        items: [{ name: 'Widget', unitPriceCents: 1000, lineTotalCents: 1000 }],
      })
    );
    const before = getPurchase(opened.db, purchaseId);
    const itemId = before?.items[0]?.item.id as string;

    updatePurchase(opened.db, purchaseId, {
      totalCents: 1500,
      lines: [
        { id: itemId, name: 'Widget', quantity: 1, lineTotalCents: 1000 },
        { name: 'Gizmo', quantity: 1, lineTotalCents: 500 },
      ],
      expectedUpdatedAt: before?.purchase.updatedAt ?? '',
    });

    const after = getPurchase(opened.db, purchaseId);
    const change = after?.edit?.changes.find((c) => c.field === 'lineAdded');
    expect(change?.original).toBeNull();
    expect(change?.current).toBe('Gizmo');
  });
});
