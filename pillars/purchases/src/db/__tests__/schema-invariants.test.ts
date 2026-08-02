/**
 * The schema's CHECK constraints and foreign keys are the pillar's last
 * line of defence against an ingest adapter writing something the
 * reconciliation engine cannot reason about. These tests assert that they
 * actually fire — a CHECK written into a migration but silently unenforced
 * (the usual cause being `foreign_keys=OFF`) is worse than none, because it
 * reads as protection.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPurchase,
  DuplicatePurchaseError,
  InvalidIngestPayloadError,
  listPurchases,
  purchases,
} from '../index.js';
import { openPurchasesDb } from '../open-purchases-db.js';
import { amazonOrder, coffeeOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let counter = 0;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

function insertOrderRaw(values: Record<string, unknown>): void {
  counter += 1;
  opened.db
    .insert(purchases)
    .values({
      source: 'amazon',
      ingestMethod: 'export',
      orderedAt: '2026-02-02T01:41:21Z',
      currency: 'AUD',
      totalCents: 5678,
      checksum: `checksum-${String(counter)}`,
      sourceOrderId: `order-${String(counter)}`,
      ...values,
    } as never)
    .run();
}

describe('pragmas', () => {
  it('enables foreign key enforcement, without which every cascade is a no-op', () => {
    const [row] = opened.raw.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(row?.foreign_keys).toBe(1);
  });

  it('runs in WAL mode', () => {
    const [row] = opened.raw.pragma('journal_mode') as { journal_mode: string }[];
    expect(row?.journal_mode).toBe('wal');
  });
});

describe('purchases constraints', () => {
  it('rejects a status outside the closed vocabulary', () => {
    expect(() => {
      insertOrderRaw({ status: 'probably_fine' });
    }).toThrow(/CHECK constraint failed/i);
  });

  it('rejects a currency that is not three characters', () => {
    expect(() => {
      insertOrderRaw({ currency: 'AUDD' });
    }).toThrow(/CHECK constraint failed/i);
  });

  it('rejects a negative discount, which would silently inflate a total', () => {
    expect(() => {
      insertOrderRaw({ discountCents: -100 });
    }).toThrow(/CHECK constraint failed/i);
  });

  it('accepts a total that disagrees with its component columns', () => {
    // Deliberate: real merchant exports disagree with their own subtotals,
    // and rejecting those at ingest would lose valid orders.
    expect(() => {
      insertOrderRaw({ subtotalCents: 5370, taxCents: 0, totalCents: 5907 });
    }).not.toThrow();
  });

  it('rejects a second order with the same merchant order id', () => {
    insertOrderRaw({ sourceOrderId: 'dupe' });
    expect(() => {
      insertOrderRaw({ sourceOrderId: 'dupe' });
    }).toThrow(/UNIQUE constraint failed/i);
  });

  it('allows many orders with no merchant order id', () => {
    // NULLs don't collide, so hand-entered orders aren't forced to invent one.
    expect(() => {
      insertOrderRaw({ sourceOrderId: null });
      insertOrderRaw({ sourceOrderId: null });
    }).not.toThrow();
  });

  it('rejects an order whose source is not registered', () => {
    expect(() => {
      insertOrderRaw({ source: 'ebay' });
    }).toThrow(/FOREIGN KEY constraint failed/i);
  });
});

describe('charge constraints', () => {
  it('rejects a role outside the closed vocabulary', () => {
    expect(() =>
      createPurchase(
        opened.db,
        amazonOrder({
          charges: [{ sourceChargeRef: 'c', amountCents: 100, role: 'vibes' as never }],
        })
      )
    ).toThrow(/CHECK constraint failed/i);
  });

  it('rejects a settlement currency that is not three characters', () => {
    // orderAmountCents is supplied so the payload clears the service-level
    // FX guard and the DB CHECK is what actually rejects it — otherwise
    // this would pass for the wrong reason.
    expect(() =>
      createPurchase(
        opened.db,
        amazonOrder({
          charges: [
            { sourceChargeRef: 'c', amountCents: 100, currency: 'AUDD', orderAmountCents: 100 },
          ],
        })
      )
    ).toThrow(/CHECK constraint failed/i);
  });
});

describe('item constraints', () => {
  it('rejects a zero quantity', () => {
    expect(() =>
      createPurchase(
        opened.db,
        amazonOrder({
          items: [{ name: 'x', quantity: 0, unitPriceCents: 100, lineTotalCents: 0 }],
        })
      )
    ).toThrow(/CHECK constraint failed/i);
  });

  it('rejects a kind outside the closed vocabulary but permits null', () => {
    expect(() =>
      createPurchase(
        opened.db,
        amazonOrder({
          items: [{ name: 'x', unitPriceCents: 100, lineTotalCents: 100, kind: 'vibes' as never }],
        })
      )
    ).toThrow(/CHECK constraint failed/i);

    expect(() =>
      createPurchase(
        opened.db,
        amazonOrder({
          checksum: 'null-kind',
          sourceOrderId: 'null-kind',
          items: [{ name: 'x', unitPriceCents: 100, lineTotalCents: 100, kind: null }],
        })
      )
    ).not.toThrow();
  });
});

describe('ingest idempotency', () => {
  it('rejects a re-ingest of the same checksum so a bundle can be uploaded twice', () => {
    createPurchase(opened.db, coffeeOrder());
    expect(() => createPurchase(opened.db, coffeeOrder())).toThrow(DuplicatePurchaseError);
    expect(listPurchases(opened.db)).toHaveLength(1);
  });

  it('rolls the whole graph back when the order insert is rejected', () => {
    createPurchase(opened.db, coffeeOrder());
    expect(() => createPurchase(opened.db, coffeeOrder())).toThrow(DuplicatePurchaseError);

    // One order's worth of everything, not two.
    const count = (table: string) =>
      (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    expect(count('purchase_items')).toBe(2);
    expect(count('purchase_shipments')).toBe(1);
    expect(count('purchase_charges')).toBe(1);
    expect(count('purchase_item_allocations')).toBe(2);
    expect(count('purchase_item_tags')).toBe(3);
  });

  it('rejects a charge pointing at an item ref the payload never defined', () => {
    expect(() =>
      createPurchase(
        opened.db,
        amazonOrder({
          items: [{ ref: 'a', name: 'A', unitPriceCents: 100, lineTotalCents: 100 }],
          charges: [
            {
              sourceChargeRef: 'c',
              amountCents: 100,
              allocations: [{ itemRef: 'typo', amountCents: 100 }],
            },
          ],
        })
      )
    ).toThrow(InvalidIngestPayloadError);
  });

  it('rejects two lines claiming the same ref rather than overwriting one', () => {
    expect(() =>
      createPurchase(
        opened.db,
        amazonOrder({
          items: [
            { ref: 'a', name: 'A', unitPriceCents: 100, lineTotalCents: 100 },
            { ref: 'a', name: 'B', unitPriceCents: 200, lineTotalCents: 200 },
          ],
        })
      )
    ).toThrow(/duplicate item ref 'a'/);
  });

  it("rejects an explicit ref colliding with an earlier line's positional key", () => {
    // Silent corruption if allowed: the charge allocation would attach to
    // the wrong line and the order would still balance, so nothing
    // downstream could detect it.
    expect(() =>
      createPurchase(
        opened.db,
        amazonOrder({
          items: [
            { name: 'Positional', unitPriceCents: 100, lineTotalCents: 100 },
            { ref: '0', name: 'Explicit', unitPriceCents: 200, lineTotalCents: 200 },
          ],
        })
      )
    ).toThrow(InvalidIngestPayloadError);
  });

  it('rejects two deliveries claiming the same ref', () => {
    expect(() =>
      createPurchase(opened.db, amazonOrder({ shipments: [{ ref: 'box' }, { ref: 'box' }] }))
    ).toThrow(InvalidIngestPayloadError);
  });

  it('writes one timestamp across the whole graph', () => {
    // Two nowIso() calls would put the order a millisecond ahead of its own
    // children, making an atomic write look like it arrived in pieces.
    const id = createPurchase(opened.db, coffeeOrder());
    const order = opened.raw
      .prepare('SELECT created_at AS ts FROM purchases WHERE id = ?')
      .get(id) as { ts: string };
    for (const table of ['purchase_shipments', 'purchase_items', 'purchase_charges']) {
      const rows = opened.raw.prepare(`SELECT DISTINCT created_at AS ts FROM ${table}`).all() as {
        ts: string;
      }[];
      expect(
        rows.map((r) => r.ts),
        table
      ).toEqual([order.ts]);
    }
  });
});

describe('cascades', () => {
  it('takes the whole graph with the order', () => {
    const id = createPurchase(opened.db, coffeeOrder());
    opened.raw.prepare('DELETE FROM purchases WHERE id = ?').run(id);

    const count = (table: string) =>
      (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    expect(count('purchase_items')).toBe(0);
    expect(count('purchase_shipments')).toBe(0);
    expect(count('purchase_charges')).toBe(0);
    expect(count('purchase_item_allocations')).toBe(0);
    expect(count('purchase_item_tags')).toBe(0);
  });
});

describe('migrations', () => {
  it('is idempotent — re-opening the same file re-applies nothing and keeps the rows', () => {
    const path = opened.raw.name;
    insertOrderRaw({ checksum: 'survives-reopen' });
    opened.raw.close();

    // A migration that is not hash-guarded would throw
    // "table purchases already exists" on the second apply.
    const reopened = openPurchasesDb(path);
    try {
      const rows = reopened.db.select().from(purchases).all();
      expect(rows.map((r) => r.checksum)).toContain('survives-reopen');
    } finally {
      reopened.raw.close();
    }
  });
});
