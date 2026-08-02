/**
 * Service-layer behaviour: dedup, cash terminality, and the residual.
 *
 * The residual cases here use the shapes the Amazon DSAR export actually
 * produces — a shipment split across two charges, and a gift-card part
 * payment that leaves a permanent gap.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPurchase,
  deletePurchase,
  DuplicatePurchaseError,
  getPurchase,
  listPurchases,
  PurchaseSourceNotFoundError,
  purchaseItems,
  purchaseTransactionLinks,
  setPurchaseStatus,
} from '../index.js';
import { amazonPurchase, openTempDb, seedAmazonSource } from './helpers.js';

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

function link(purchaseId: string, uri: string, amountCents: number, confirmed = false): void {
  opened.db
    .insert(purchaseTransactionLinks)
    .values({
      purchaseId,
      transactionUri: uri,
      amountCents,
      linkType: 'split',
      ...(confirmed ? { confirmedAt: '2026-02-10T00:00:00Z' } : {}),
    })
    .run();
}

describe('createPurchase', () => {
  it('writes the purchase and its lines in one go', () => {
    const detail = createPurchase(
      opened.db,
      amazonPurchase({
        totalCents: 5678,
        items: [
          {
            name: 'Espresso tamping station',
            sku: 'B0DSVZQ8P5',
            unitPriceCents: 4499,
            lineTotalCents: 4499,
          },
          {
            name: 'Magnetic dosing funnel',
            sku: 'B0FCSJTKJ8',
            unitPriceCents: 1179,
            lineTotalCents: 1179,
          },
        ],
      })
    );

    expect(detail.items).toHaveLength(2);
    expect(detail.items.map((i) => i.lineTotalCents).reduce((a, b) => a + b, 0)).toBe(5678);
    expect(detail.purchase.status).toBe('awaiting_settlement');
    // No links yet, so the whole total is unexplained. That is the correct
    // state, not an error.
    expect(detail.residualCents).toBe(5678);
  });

  it('rejects a re-ingest of the same checksum so a bundle can be uploaded twice', () => {
    createPurchase(opened.db, amazonPurchase());
    expect(() => createPurchase(opened.db, amazonPurchase())).toThrow(DuplicatePurchaseError);
    expect(listPurchases(opened.db)).toHaveLength(1);
  });

  it('rolls the line items back when the purchase insert is rejected', () => {
    createPurchase(
      opened.db,
      amazonPurchase({ items: [{ name: 'first', unitPriceCents: 100, lineTotalCents: 100 }] })
    );
    expect(() =>
      createPurchase(
        opened.db,
        amazonPurchase({ items: [{ name: 'second', unitPriceCents: 200, lineTotalCents: 200 }] })
      )
    ).toThrow(DuplicatePurchaseError);

    const names = opened.db
      .select()
      .from(purchaseItems)
      .all()
      .map((i) => i.name);
    expect(names).toEqual(['first']);
  });

  it('refuses a source that is not registered', () => {
    expect(() => createPurchase(opened.db, amazonPurchase({ source: 'ebay' }))).toThrow(
      PurchaseSourceNotFoundError
    );
  });

  it('marks a cash purchase terminal on arrival rather than awaiting a settlement that will never come', () => {
    const detail = createPurchase(
      opened.db,
      amazonPurchase({ settlementMode: 'cash', checksum: 'cash-1' })
    );
    expect(detail.purchase.status).toBe('settled_cash');
  });

  it("stores tags as a JSON string — the array projection is the REST layer's job", () => {
    const detail = createPurchase(
      opened.db,
      amazonPurchase({
        items: [
          {
            name: 'Coffee beans',
            unitPriceCents: 2200,
            lineTotalCents: 2200,
            tags: ['groceries', 'coffee'],
          },
        ],
      })
    );
    const stored = opened.db.select().from(purchaseItems).all()[0];
    expect(stored?.tags).toBe('["groceries","coffee"]');
    expect(detail.items[0]?.tags).toBe('["groceries","coffee"]');
  });
});

describe('residual', () => {
  it('is zero once a shipment split is fully linked across two charges', () => {
    const { purchase } = createPurchase(opened.db, amazonPurchase({ totalCents: 5678 }));
    link(purchase.id, 'pops://finance/transaction/a', 4499);
    link(purchase.id, 'pops://finance/transaction/b', 1179);

    expect(getPurchase(opened.db, purchase.id)?.residualCents).toBe(0);
  });

  it('stays positive when a gift card paid part of the order', () => {
    // $56.78 ordered, $40.00 hit the card, $16.78 came off a gift balance.
    // No transaction will ever explain the remainder — the gap is the
    // answer, and hiding it would be a false certainty.
    const { purchase } = createPurchase(opened.db, amazonPurchase({ totalCents: 5678 }));
    link(purchase.id, 'pops://finance/transaction/partial', 4000);

    expect(getPurchase(opened.db, purchase.id)?.residualCents).toBe(1678);
  });

  it('goes negative rather than clamping when over-linked', () => {
    const { purchase } = createPurchase(opened.db, amazonPurchase({ totalCents: 5678 }));
    link(purchase.id, 'pops://finance/transaction/a', 5678);
    link(purchase.id, 'pops://finance/transaction/b', 100);

    expect(getPurchase(opened.db, purchase.id)?.residualCents).toBe(-100);
  });

  it('nets a refund back out', () => {
    const { purchase } = createPurchase(opened.db, amazonPurchase({ totalCents: 5678 }));
    link(purchase.id, 'pops://finance/transaction/charge', 5678);
    link(purchase.id, 'pops://finance/transaction/refund', -1179);

    expect(getPurchase(opened.db, purchase.id)?.residualCents).toBe(1179);
  });
});

describe('listPurchases', () => {
  beforeEach(() => {
    createPurchase(opened.db, amazonPurchase({ checksum: 'a', orderedAt: '2026-01-01T00:00:00Z' }));
    createPurchase(opened.db, amazonPurchase({ checksum: 'b', orderedAt: '2026-02-01T00:00:00Z' }));
    createPurchase(opened.db, amazonPurchase({ checksum: 'c', orderedAt: '2026-03-01T00:00:00Z' }));
  });

  it('returns newest first', () => {
    expect(listPurchases(opened.db).map((p) => p.checksum)).toEqual(['c', 'b', 'a']);
  });

  it('bounds by orderedAt inclusively at both ends', () => {
    const rows = listPurchases(opened.db, {
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
    });
    expect(rows.map((p) => p.checksum)).toEqual(['b', 'a']);
  });

  it('filters by status', () => {
    const [newest] = listPurchases(opened.db);
    if (newest === undefined) throw new Error('expected a purchase');
    setPurchaseStatus(opened.db, newest.id, 'linked');

    expect(listPurchases(opened.db, { statuses: ['linked'] }).map((p) => p.checksum)).toEqual([
      'c',
    ]);
  });

  it('ignores an empty filter array rather than matching nothing', () => {
    expect(listPurchases(opened.db, { sources: [], statuses: [] })).toHaveLength(3);
  });

  it('paginates deterministically', () => {
    const page1 = listPurchases(opened.db, { limit: 2, offset: 0 });
    const page2 = listPurchases(opened.db, { limit: 2, offset: 2 });
    expect(page1.map((p) => p.checksum)).toEqual(['c', 'b']);
    expect(page2.map((p) => p.checksum)).toEqual(['a']);
  });
});

describe('deletePurchase', () => {
  it('cascades items and links away with it', () => {
    const { purchase } = createPurchase(
      opened.db,
      amazonPurchase({ items: [{ name: 'thing', unitPriceCents: 100, lineTotalCents: 100 }] })
    );
    link(purchase.id, 'pops://finance/transaction/a', 100, true);

    expect(deletePurchase(opened.db, purchase.id)).toBe(true);
    expect(opened.db.select().from(purchaseItems).all()).toHaveLength(0);
    expect(opened.db.select().from(purchaseTransactionLinks).all()).toHaveLength(0);
  });

  it('reports false for an id that was never there', () => {
    expect(deletePurchase(opened.db, 'nope')).toBe(false);
  });
});
