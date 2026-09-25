/**
 * Migration 0019 against orders written before `nothing_to_settle` existed.
 *
 * POPS-4648: a zero-total order never got a derived charge minted (the
 * sweep deliberately excludes `total_cents = 0`) and so never had coverage
 * computed for it, leaving it at whatever it was created with —
 * `awaiting_settlement`, or an earlier bug's `partial` — forever. This is
 * that fleet, staged as it actually looked, reopened through 0019 the way
 * the real database will be the next time the purchases image starts.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openSeededAtMigration } from './migration-harness.js';

import type Database from 'better-sqlite3';

import type { OpenedPurchasesDb } from '../index.js';

/** The last entry before 0019 backfills nothing_to_settle. */
const BEFORE_BACKFILL = '0018_amazon_source_matching';

function seedThrough0018(raw: Database.Database): void {
  raw.prepare(`INSERT INTO purchase_sources (id, label) VALUES ('amazon', 'Amazon')`).run();

  function insertPurchase(id: string, totalCents: number, status: string) {
    raw
      .prepare(
        `INSERT INTO purchases
           (id, source, source_order_id, ingest_method, ordered_at, currency, total_cents, checksum, status)
         VALUES (?, 'amazon', ?, 'export', '2026-02-02T01:41:21Z', 'AUD', ?, ?, ?)`
      )
      .run(id, `order-${id}`, totalCents, `checksum-${id}`, status);
  }

  function insertCharge(id: string, purchaseId: string, role: string, amountCents: number) {
    raw
      .prepare(
        `INSERT INTO purchase_charges (id, purchase_id, position, amount_cents, currency, order_amount_cents, role)
         VALUES (?, ?, 0, ?, 'AUD', ?, ?)`
      )
      .run(id, purchaseId, amountCents, amountCents, role);
  }

  // Zero total, never charged at all — the common case: cancelled before
  // any payment existed.
  insertPurchase('p-zero-untouched', 0, 'awaiting_settlement');

  // Zero total that an earlier bug left `partial` — must still move.
  insertPurchase('p-zero-partial-bug', 0, 'partial');

  // Zero total with a refund charge: money did move, and that refund still
  // needs to be matched to the transaction that returned it, so this order
  // stays in the ordinary queue rather than reading as settled.
  insertPurchase('p-zero-with-refund', 0, 'awaiting_settlement');
  insertCharge('c-zero-refund', 'p-zero-with-refund', 'refund', -500);

  // Non-zero total — untouched by this migration regardless of status.
  insertPurchase('p-nonzero', 4000, 'awaiting_settlement');

  // Zero total, but already settled_cash or ignored by a person — must be
  // left exactly as it was.
  insertPurchase('p-zero-cash', 0, 'settled_cash');
  insertPurchase('p-zero-ignored', 0, 'ignored');
}

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openSeededAtMigration({
    through: BEFORE_BACKFILL,
    prefix: 'purchases-migration-0019-',
    seed: seedThrough0018,
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

describe('applying 0019 to orders written before nothing_to_settle existed', () => {
  it('moves an untouched zero-total order to nothing_to_settle', () => {
    expect(storedStatus('p-zero-untouched')).toBe('nothing_to_settle');
  });

  it('moves a zero-total order mis-derived partial by an earlier bug', () => {
    expect(storedStatus('p-zero-partial-bug')).toBe('nothing_to_settle');
  });

  it('leaves a zero-total order with a refund charge at awaiting_settlement', () => {
    expect(storedStatus('p-zero-with-refund')).toBe('awaiting_settlement');
  });

  it('never touches a non-zero-total order', () => {
    expect(storedStatus('p-nonzero')).toBe('awaiting_settlement');
  });

  it('never touches settled_cash, even at zero total', () => {
    expect(storedStatus('p-zero-cash')).toBe('settled_cash');
  });

  it('never touches ignored, even at zero total', () => {
    expect(storedStatus('p-zero-ignored')).toBe('ignored');
  });
});
