/**
 * Migration 0017 against orders written before anything recomputed
 * `purchases.status` from their links.
 *
 * POPS-4612: `setPurchaseStatus` existed but nothing called it outside
 * tests, so every production order sat at `awaiting_settlement` (or
 * `settled_cash`) no matter how thoroughly the reconcile sweep had linked
 * it. This is that fleet, staged as it actually looked — links written,
 * status untouched — and reopened through 0017 the way the real database
 * will be the next time the purchases image starts.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openSeededAtMigration } from './migration-harness.js';

import type Database from 'better-sqlite3';

import type { OpenedPurchasesDb } from '../index.js';

/** The last entry before 0017 recomputes status. */
const BEFORE_BACKFILL = '0016_purchase_edits';

function seedThrough0016(raw: Database.Database): void {
  raw.prepare(`INSERT INTO purchase_sources (id, label) VALUES ('amazon', 'Amazon')`).run();

  function insertPurchase(
    id: string,
    totalCents: number,
    status: string,
    settlementMode = 'unknown'
  ) {
    raw
      .prepare(
        `INSERT INTO purchases
           (id, source, source_order_id, ingest_method, ordered_at, currency, total_cents, checksum, status, settlement_mode)
         VALUES (?, 'amazon', ?, 'export', '2026-02-02T01:41:21Z', 'AUD', ?, ?, ?, ?)`
      )
      .run(id, `order-${id}`, totalCents, `checksum-${id}`, status, settlementMode);
  }

  function insertCharge(id: string, purchaseId: string, role: string, amountCents: number) {
    raw
      .prepare(
        `INSERT INTO purchase_charges (id, purchase_id, position, amount_cents, currency, order_amount_cents, role)
         VALUES (?, ?, 0, ?, 'AUD', ?, ?)`
      )
      .run(id, purchaseId, amountCents, amountCents, role);
  }

  function insertLink(
    id: string,
    chargeId: string,
    uri: string,
    amountCents: number,
    confirmedAt: string | null
  ) {
    raw
      .prepare(
        `INSERT INTO purchase_charge_links (id, charge_id, transaction_uri, amount_cents, link_type, confirmed_at)
         VALUES (?, ?, ?, ?, 'exact', ?)`
      )
      .run(id, chargeId, uri, amountCents, confirmedAt);
  }

  // Fully linked, but the link was never confirmed — stuck at
  // awaiting_settlement because nothing ever recomputed it.
  insertPurchase('p-full-unconfirmed', 5000, 'awaiting_settlement');
  insertCharge('c-full-unconfirmed', 'p-full-unconfirmed', 'capture', 5000);
  insertLink(
    'l-full-unconfirmed',
    'c-full-unconfirmed',
    'pops://finance/transaction/t1',
    5000,
    null
  );

  // Fully linked AND confirmed — same bug, worse: even a human's decision
  // never moved the status.
  insertPurchase('p-full-confirmed', 3000, 'awaiting_settlement');
  insertCharge('c-full-confirmed', 'p-full-confirmed', 'capture', 3000);
  insertLink(
    'l-full-confirmed',
    'c-full-confirmed',
    'pops://finance/transaction/t2',
    3000,
    '2026-03-01T00:00:00Z'
  );

  // Two charges, one linked — partial coverage.
  insertPurchase('p-partial', 5000, 'awaiting_settlement');
  insertCharge('c-partial-1', 'p-partial', 'capture', 3000);
  insertCharge('c-partial-2', 'p-partial', 'capture', 2000);
  insertLink('l-partial', 'c-partial-1', 'pops://finance/transaction/t3', 3000, null);

  // No links at all — already correct, must stay put.
  insertPurchase('p-untouched', 4000, 'awaiting_settlement');
  insertCharge('c-untouched', 'p-untouched', 'capture', 4000);

  // A refund alongside a fully-linked capture — must read as linked, not
  // dragged down by the refund the way a naive "every charge needs a link"
  // rule would read it.
  insertPurchase('p-with-refund', 5678, 'awaiting_settlement');
  insertCharge('c-refund-capture', 'p-with-refund', 'capture', 5678);
  insertCharge('c-refund-refund', 'p-with-refund', 'refund', -1000);
  insertLink('l-refund-capture', 'c-refund-capture', 'pops://finance/transaction/t4', 5678, null);

  // Paid cash, fully linked (a hand-corrected charge, say) — must be left
  // exactly as it was. `settled_cash` is not derived from links.
  insertPurchase('p-cash', 2000, 'settled_cash', 'cash');
  insertCharge('c-cash', 'p-cash', 'capture', 2000);
  insertLink('l-cash', 'c-cash', 'pops://finance/transaction/t5', 2000, null);

  // Ignored, fully linked — must also be left exactly as it was.
  insertPurchase('p-ignored', 2000, 'ignored');
  insertCharge('c-ignored', 'p-ignored', 'capture', 2000);
  insertLink('l-ignored', 'c-ignored', 'pops://finance/transaction/t6', 2000, null);
}

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openSeededAtMigration({
    through: BEFORE_BACKFILL,
    prefix: 'purchases-migration-0017-',
    seed: seedThrough0016,
  }));
});

afterEach(() => {
  cleanup();
});

function storedStatus(id: string): string {
  const row = opened.raw.prepare(`SELECT status FROM purchases WHERE id = ?`).get(id) as {
    status: string;
  };
  return row.status;
}

describe('applying 0017 to orders written before status was ever recomputed', () => {
  it('moves a fully-linked, unconfirmed order to linked', () => {
    expect(storedStatus('p-full-unconfirmed')).toBe('linked');
  });

  it('moves a fully-linked, confirmed order to linked too', () => {
    expect(storedStatus('p-full-confirmed')).toBe('linked');
  });

  it('moves a partially-linked order to partial', () => {
    expect(storedStatus('p-partial')).toBe('partial');
  });

  it('leaves an order with no links at awaiting_settlement', () => {
    expect(storedStatus('p-untouched')).toBe('awaiting_settlement');
  });

  it('reads a fully-linked capture as linked regardless of an unrelated refund', () => {
    expect(storedStatus('p-with-refund')).toBe('linked');
  });

  it('never touches settled_cash, even fully linked', () => {
    expect(storedStatus('p-cash')).toBe('settled_cash');
  });

  it('never touches ignored, even fully linked', () => {
    expect(storedStatus('p-ignored')).toBe('ignored');
  });
});
