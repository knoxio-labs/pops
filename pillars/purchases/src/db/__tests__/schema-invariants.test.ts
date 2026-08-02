/**
 * The schema's CHECK constraints and foreign keys are the pillar's last
 * line of defence against an ingest adapter writing something the
 * reconciliation engine cannot reason about. These tests assert that they
 * actually fire — a CHECK written into a migration but silently unenforced
 * (the usual cause being `foreign_keys=OFF`) is worse than none, because it
 * reads as protection.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openPurchasesDb } from '../open-purchases-db.js';
import { purchaseItems, purchases, purchaseTransactionLinks } from '../schema.js';
import { openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let checksumCounter = 0;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

function insertPurchaseRaw(values: Record<string, unknown>): void {
  opened.db
    .insert(purchases)
    .values({
      source: 'amazon',
      ingestMethod: 'export',
      orderedAt: '2026-02-02T01:41:21Z',
      currency: 'AUD',
      totalCents: 5678,
      checksum: `checksum-${String(++checksumCounter)}`,
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

describe('purchases CHECK constraints', () => {
  it('rejects a status outside the closed vocabulary', () => {
    expect(() => {
      insertPurchaseRaw({ status: 'probably_fine' });
    }).toThrow(/CHECK constraint failed/i);
  });

  it('rejects an ingest method outside the closed vocabulary', () => {
    expect(() => {
      insertPurchaseRaw({ ingestMethod: 'telepathy' });
    }).toThrow(/CHECK constraint failed/i);
  });

  it('rejects a currency that is not three characters', () => {
    expect(() => {
      insertPurchaseRaw({ currency: 'AUDD' });
    }).toThrow(/CHECK constraint failed/i);
  });

  it('rejects a negative discount, which would silently inflate a total', () => {
    expect(() => {
      insertPurchaseRaw({ discountCents: -100 });
    }).toThrow(/CHECK constraint failed/i);
  });

  it('accepts a total that disagrees with its component columns', () => {
    // Deliberate: real merchant exports disagree with their own subtotals,
    // and rejecting those at ingest would lose valid purchases.
    expect(() => {
      insertPurchaseRaw({
        subtotalCents: 5370,
        taxCents: 0,
        shippingCents: 0,
        discountCents: 0,
        totalCents: 5907,
      });
    }).not.toThrow();
  });

  it('rejects a second purchase with the same checksum', () => {
    insertPurchaseRaw({ checksum: 'dupe' });
    expect(() => {
      insertPurchaseRaw({ checksum: 'dupe' });
    }).toThrow(/UNIQUE constraint failed/i);
  });

  it('rejects a purchase whose source is not registered', () => {
    expect(() => {
      insertPurchaseRaw({ source: 'ebay' });
    }).toThrow(/FOREIGN KEY constraint failed/i);
  });
});

describe('purchase_items CHECK constraints', () => {
  function seedPurchase(): string {
    const rows = opened.db
      .insert(purchases)
      .values({
        source: 'amazon',
        ingestMethod: 'export',
        orderedAt: '2026-02-02T01:41:21Z',
        currency: 'AUD',
        totalCents: 5678,
        checksum: 'items-parent',
      })
      .returning()
      .all();
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('failed to seed parent purchase');
    return id;
  }

  it('rejects a zero quantity', () => {
    const purchaseId = seedPurchase();
    expect(() => {
      opened.db
        .insert(purchaseItems)
        .values({
          purchaseId,
          name: 'Dosing funnel',
          quantity: 0,
          unitPriceCents: 1179,
          lineTotalCents: 0,
        })
        .run();
    }).toThrow(/CHECK constraint failed/i);
  });

  it('rejects a kind outside the closed vocabulary but permits null', () => {
    const purchaseId = seedPurchase();
    expect(() => {
      opened.db
        .insert(purchaseItems)
        .values({
          purchaseId,
          name: 'Tamping station',
          unitPriceCents: 4499,
          lineTotalCents: 4499,
          kind: 'vibes' as never,
        })
        .run();
    }).toThrow(/CHECK constraint failed/i);

    expect(() => {
      opened.db
        .insert(purchaseItems)
        .values({
          purchaseId,
          name: 'Tamping station',
          unitPriceCents: 4499,
          lineTotalCents: 4499,
          kind: null,
        })
        .run();
    }).not.toThrow();
  });
});

describe('purchase_transaction_links', () => {
  function seedPurchase(): string {
    const rows = opened.db
      .insert(purchases)
      .values({
        source: 'amazon',
        ingestMethod: 'export',
        orderedAt: '2026-02-02T01:41:21Z',
        currency: 'AUD',
        totalCents: 5678,
        checksum: 'links-parent',
      })
      .returning()
      .all();
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('failed to seed parent purchase');
    return id;
  }

  it('rejects a second link between the same purchase and transaction', () => {
    const purchaseId = seedPurchase();
    const values = {
      purchaseId,
      transactionUri: 'pops://finance/transaction/abc',
      amountCents: 5678,
      linkType: 'exact' as const,
    };
    opened.db.insert(purchaseTransactionLinks).values(values).run();
    expect(() => {
      opened.db.insert(purchaseTransactionLinks).values(values).run();
    }).toThrow(/UNIQUE constraint failed/i);
  });

  it('accepts a negative amount, which is how a refund nets against an order', () => {
    const purchaseId = seedPurchase();
    expect(() => {
      opened.db
        .insert(purchaseTransactionLinks)
        .values({
          purchaseId,
          transactionUri: 'pops://finance/transaction/refund-1',
          amountCents: -1179,
          linkType: 'refund',
        })
        .run();
    }).not.toThrow();
  });

  it('rejects a confidence outside 0..1', () => {
    const purchaseId = seedPurchase();
    expect(() => {
      opened.db
        .insert(purchaseTransactionLinks)
        .values({
          purchaseId,
          transactionUri: 'pops://finance/transaction/overconfident',
          amountCents: 5678,
          linkType: 'exact',
          confidence: 1.5,
        })
        .run();
    }).toThrow(/CHECK constraint failed/i);
  });

  it('cascades away when its purchase is deleted', () => {
    const purchaseId = seedPurchase();
    opened.db
      .insert(purchaseTransactionLinks)
      .values({
        purchaseId,
        transactionUri: 'pops://finance/transaction/doomed',
        amountCents: 5678,
        linkType: 'exact',
      })
      .run();
    opened.raw.prepare('DELETE FROM purchases WHERE id = ?').run(purchaseId);
    expect(opened.db.select().from(purchaseTransactionLinks).all()).toHaveLength(0);
  });
});

describe('migrations', () => {
  it('is idempotent — re-opening the same file re-applies nothing and keeps the rows', () => {
    const path = opened.raw.name;
    insertPurchaseRaw({ checksum: 'survives-reopen' });
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
