/**
 * The sweep's charge-scoped queries against a charge list large enough to
 * have failed before chunking existed.
 *
 * SQLite refuses to prepare a statement with more than
 * `SQLITE_MAX_VARIABLE_NUMBER` bound parameters. Rather than assume that
 * number, `measureSqliteMaxVariableNumber` finds it on whatever build this
 * suite is actually linked against, and these tests drive
 * `tearDownUnconfirmedLinks` and `listRejectedPairings` past it directly —
 * before chunking, both threw "too many SQL variables" the moment a real
 * fleet's charge count crossed it.
 */
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPurchase, listRejectedPairings, tearDownUnconfirmedLinks } from '../index.js';
import { amazonOrder, ARRANGEMENT_TIMEOUT_MS, openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';
import type { TempDb } from './helpers.js';

/**
 * The largest number of `?` placeholders SQLite will bind in one statement
 * on this build, found by doubling and then bisecting rather than assumed —
 * the value differs across SQLite builds (999 historically, 32766 on
 * current ones), and asserting against a guess would make this suite pass
 * or fail on a fact about the platform it never checked.
 */
function measureSqliteMaxVariableNumber(): number {
  const probe = new Database(':memory:');
  const canBind = (n: number): boolean => {
    try {
      probe.prepare(`SELECT 1 WHERE 1 IN (${Array.from({ length: n }, () => '?').join(',')})`);
      return true;
    } catch {
      return false;
    }
  };

  try {
    let low = 1;
    let high = 2;
    while (canBind(high)) {
      low = high;
      high *= 2;
    }
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (canBind(mid)) low = mid;
      else high = mid;
    }
    return low;
  } finally {
    probe.close();
  }
}

/** Bulk-insert `count` bare charges on `purchaseId`, bypassing `createPurchase` for speed. */
function insertCharges(raw: Database.Database, purchaseId: string, count: number): string[] {
  const ids = Array.from({ length: count }, () => crypto.randomUUID());
  const insert = raw.prepare(
    `INSERT INTO purchase_charges
       (id, purchase_id, position, amount_cents, currency, order_amount_cents, role)
     VALUES (?, ?, ?, ?, 'AUD', ?, 'capture')`
  );
  const insertMany = raw.transaction((rows: readonly string[]) => {
    rows.forEach((id, i) => insert.run(id, purchaseId, i, 100, 100));
  });
  insertMany(ids);
  return ids;
}

function insertUnconfirmedLink(raw: Database.Database, chargeId: string, linkId: string): void {
  raw
    .prepare(
      `INSERT INTO purchase_charge_links
         (id, charge_id, transaction_uri, amount_cents, link_type, confirmed_at)
       VALUES (?, ?, ?, 100, 'exact', NULL)`
    )
    .run(linkId, chargeId, `pops://finance/transaction/${linkId}`);
}

function insertConfirmedLink(raw: Database.Database, chargeId: string, linkId: string): void {
  raw
    .prepare(
      `INSERT INTO purchase_charge_links
         (id, charge_id, transaction_uri, amount_cents, link_type, confirmed_at)
       VALUES (?, ?, ?, 100, 'exact', '2026-01-01T00:00:00.000Z')`
    )
    .run(linkId, chargeId, `pops://finance/transaction/${linkId}`);
}

function insertRejection(raw: Database.Database, chargeId: string, transactionUri: string): void {
  raw
    .prepare(`INSERT INTO purchase_link_rejections (charge_id, transaction_uri) VALUES (?, ?)`)
    .run(chargeId, transactionUri);
}

describe('sweep charge-scoped queries at real SQLite scale', () => {
  let temp: TempDb;
  let opened: OpenedPurchasesDb;
  let overLimitCount: number;

  beforeEach(() => {
    temp = openTempDb();
    opened = temp.opened;
    seedAmazonSource(opened);
    overLimitCount = measureSqliteMaxVariableNumber() + 500;
  });

  afterEach(() => {
    temp.cleanup();
  });

  it(
    'tears down every unconfirmed link across a charge list past the bound-parameter cap, leaving a confirmed one untouched',
    () => {
      const purchaseId = createPurchase(
        opened.db,
        amazonOrder({ checksum: 'amazon:chunk-write', sourceOrderId: 'amazon-chunk-write' })
      );
      const chargeIds = insertCharges(opened.raw, purchaseId, overLimitCount);

      // One confirmed link, deliberately placed mid-list so it lands in a
      // chunk surrounded by unconfirmed ones — a chunking bug that dropped
      // the `confirmedAt IS NULL` predicate on some chunks would still pass
      // a test where the confirmed row was the first or last id.
      const pinnedChargeId = chargeIds[Math.floor(chargeIds.length / 2)];
      if (pinnedChargeId === undefined) throw new Error('expected a mid-list charge id');
      insertConfirmedLink(opened.raw, pinnedChargeId, 'pinned-link');

      for (const chargeId of chargeIds) {
        if (chargeId === pinnedChargeId) continue;
        insertUnconfirmedLink(opened.raw, chargeId, `unconfirmed-${chargeId}`);
      }

      const removed = tearDownUnconfirmedLinks(opened.db, chargeIds);

      expect(removed).toBe(chargeIds.length - 1);
      const remaining = opened.raw
        .prepare('SELECT charge_id AS chargeId FROM purchase_charge_links')
        .all() as { chargeId: string }[];
      expect(remaining).toEqual([{ chargeId: pinnedChargeId }]);
    },
    ARRANGEMENT_TIMEOUT_MS
  );

  it(
    'returns every rejection for a charge list past the bound-parameter cap, and none for an id outside it',
    () => {
      const purchaseId = createPurchase(
        opened.db,
        amazonOrder({ checksum: 'amazon:chunk-read', sourceOrderId: 'amazon-chunk-read' })
      );
      const chargeIds = insertCharges(opened.raw, purchaseId, overLimitCount);

      for (const chargeId of chargeIds) {
        insertRejection(opened.raw, chargeId, `pops://finance/transaction/${chargeId}`);
      }

      // A charge outside the swept list: its rejection must never appear
      // among results scoped to `chargeIds`, chunked or not.
      const outsideCharge = insertCharges(opened.raw, purchaseId, 1)[0];
      if (outsideCharge === undefined) throw new Error('expected an out-of-scope charge id');
      insertRejection(opened.raw, outsideCharge, 'pops://finance/transaction/outside');

      const rejections = listRejectedPairings(opened.db, chargeIds);

      expect(rejections).toHaveLength(chargeIds.length);
      const byChargeId = new Map(rejections.map((r) => [r.chargeId, r.transactionUri]));
      for (const chargeId of chargeIds) {
        expect(byChargeId.get(chargeId)).toBe(`pops://finance/transaction/${chargeId}`);
      }
      expect(byChargeId.has(outsideCharge)).toBe(false);
    },
    ARRANGEMENT_TIMEOUT_MS
  );
});
