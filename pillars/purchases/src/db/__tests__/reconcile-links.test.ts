/**
 * `listPurchasesForTransaction` — the order its answer comes back in, and
 * the one-snapshot guarantee its two reads make.
 *
 * The grouping itself is already driven end to end by
 * `api/__tests__/transaction-links-api.test.ts`: a combined settlement across
 * two orders, two charges of one order summed into that order alone, and a
 * transaction no order explains. What no test there pins is the sequence —
 * that file sorts the answer before comparing it, deliberately, because it is
 * asserting membership. Order is a contract of this function rather than of
 * the route: ids are random UUIDs and one ingest's rows share a `createdAt`
 * to the second, so without the explicit `orderBy` the result is genuinely
 * non-deterministic and nothing downstream would notice.
 */
import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import {
  createPurchase,
  listPurchasesForTransaction,
  listSolvableCharges,
  persistProposedLinks,
} from '../index.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { ProposedLink } from '../../reconcile/types.js';

interface RaceableStatement {
  readonly source: string;
  all(...params: unknown[]): unknown[];
}

function link(chargeId: string, transactionUri: string, amountCents: number): ProposedLink {
  return {
    chargeId,
    transactionUri,
    transactionDescription: 'AMAZON',
    amountCents,
    linkType: 'exact',
    confidence: 1,
    matchRuleId: null,
  };
}

describe('listPurchasesForTransaction', () => {
  it('returns the orders of one settlement newest first, not in the order they were ingested', () => {
    const temp = openTempDb();
    const opened = temp.opened;
    seedAmazonSource(opened);

    // Ingested newest-first so that insertion order and `orderedAt` order
    // disagree: an implementation that returned rows as SQLite handed them
    // back would answer with the older order at the front.
    const newerOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:combined-newer',
        sourceOrderId: 'amazon-combined-newer',
        orderedAt: '2026-01-02T00:00:00Z',
        totalCents: 2000,
        charges: [{ sourceChargeRef: 'cb', amountCents: 2000, role: 'capture' }],
      })
    );
    const olderOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:combined-older',
        sourceOrderId: 'amazon-combined-older',
        orderedAt: '2026-01-01T00:00:00Z',
        totalCents: 1000,
        charges: [{ sourceChargeRef: 'ca', amountCents: 1000, role: 'capture' }],
      })
    );

    const charges = listSolvableCharges(opened.db, { source: 'amazon' });
    const newerCharge = charges.find((c) => c.purchaseId === newerOrderId);
    const olderCharge = charges.find((c) => c.purchaseId === olderOrderId);
    if (newerCharge === undefined || olderCharge === undefined) {
      throw new Error('expected both orders to have solvable charges');
    }

    const transactionUri = 'pops://finance/transaction/two-orders';
    persistProposedLinks(opened.db, [
      link(newerCharge.id, transactionUri, -2000),
      link(olderCharge.id, transactionUri, -1000),
    ]);

    const result = listPurchasesForTransaction(opened.db, transactionUri);

    expect(result.map((entry) => entry.purchase.id)).toEqual([newerOrderId, olderOrderId]);

    temp.cleanup();
  });

  it('orders a combined settlement newest order first, tied orders by id', () => {
    // Two orders share an `orderedAt` — every row of one ingest does, to the
    // second — and must fall back to `id` ascending, while a third, later
    // order must still sort ahead of both. Asserting the raw response, with
    // no `.toSorted()`, is what makes deleting the service's `.orderBy(...)`
    // turn this red.
    const temp = openTempDb();
    const opened = temp.opened;
    seedAmazonSource(opened);

    const tiedOrderedAt = '2026-01-02T00:00:00Z';
    const tieOrderIdA = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:tie-a',
        sourceOrderId: 'amazon-tie-a',
        orderedAt: tiedOrderedAt,
        totalCents: 1000,
        charges: [{ sourceChargeRef: 'ta', amountCents: 1000, role: 'capture' }],
      })
    );
    const tieOrderIdB = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:tie-b',
        sourceOrderId: 'amazon-tie-b',
        orderedAt: tiedOrderedAt,
        totalCents: 2000,
        charges: [{ sourceChargeRef: 'tb', amountCents: 2000, role: 'capture' }],
      })
    );
    const newestOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:newest',
        sourceOrderId: 'amazon-newest',
        orderedAt: '2026-01-03T00:00:00Z',
        totalCents: 3000,
        charges: [{ sourceChargeRef: 'cn', amountCents: 3000, role: 'capture' }],
      })
    );

    const charges = listSolvableCharges(opened.db, { source: 'amazon' });
    const tieChargeA = charges.find((c) => c.purchaseId === tieOrderIdA);
    const tieChargeB = charges.find((c) => c.purchaseId === tieOrderIdB);
    const newestCharge = charges.find((c) => c.purchaseId === newestOrderId);
    if (tieChargeA === undefined || tieChargeB === undefined || newestCharge === undefined) {
      throw new Error('expected all three orders to have solvable charges');
    }

    const transactionUri = 'pops://finance/transaction/three-way-tie';
    persistProposedLinks(opened.db, [
      link(tieChargeA.id, transactionUri, -1000),
      link(tieChargeB.id, transactionUri, -2000),
      link(newestCharge.id, transactionUri, -3000),
    ]);

    const result = listPurchasesForTransaction(opened.db, transactionUri);

    const [first, second] = [tieOrderIdA, tieOrderIdB].toSorted((a, b) => (a < b ? -1 : 1));
    expect(result.map((entry) => entry.purchase.id)).toEqual([newestOrderId, first, second]);

    temp.cleanup();
  });

  it('reflects one snapshot: a concurrent charge delete between the two reads does not understate linkedCents', () => {
    const temp = openTempDb();
    const opened = temp.opened;
    seedAmazonSource(opened);

    const purchaseId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:split-race',
        sourceOrderId: 'amazon-split-race',
        orderedAt: '2026-01-01T00:00:00Z',
        totalCents: 1000,
        charges: [
          { sourceChargeRef: 'race-1', amountCents: 700, role: 'capture' },
          { sourceChargeRef: 'race-2', amountCents: 300, role: 'capture' },
        ],
      })
    );

    const charges = listSolvableCharges(opened.db, { source: 'amazon' })
      .filter((c) => c.purchaseId === purchaseId)
      .toSorted((a, b) => a.amountCents - b.amountCents);
    expect(charges).toHaveLength(2);
    const [chargeToDelete, chargeToKeep] = charges;
    if (chargeToDelete === undefined || chargeToKeep === undefined) {
      throw new Error('expected two solvable charges on the split order');
    }

    const transactionUri = 'pops://finance/transaction/split-race';
    persistProposedLinks(opened.db, [
      link(chargeToDelete.id, transactionUri, -300),
      link(chargeToKeep.id, transactionUri, -700),
    ]);

    // A second connection to the same on-disk file, standing in for the
    // sweep's own connection in a different process. WAL gives a deferred
    // transaction a snapshot fixed at its first statement, held for the
    // rest of the transaction regardless of what any other connection
    // commits afterward — that fixed snapshot is exactly what is under
    // test here, and it is why this interleaving needs no timing tricks:
    // better-sqlite3 is fully synchronous, so the delete below runs at a
    // precise, repeatable point relative to the two reads.
    const raceConnection = new Database(opened.raw.name);
    raceConnection.pragma('journal_mode = WAL');
    raceConnection.pragma('foreign_keys = ON');
    raceConnection.pragma('busy_timeout = 5000');

    const statementProto: RaceableStatement = Object.getPrototypeOf(opened.raw.prepare('SELECT 1'));
    const originalAll = statementProto.all;
    let interleaved = false;
    const spy = vi.spyOn(statementProto, 'all').mockImplementation(function (
      this: RaceableStatement,
      ...args: unknown[]
    ) {
      const result = originalAll.apply(this, args);
      if (
        !interleaved &&
        this.source.trim().toUpperCase().startsWith('SELECT') &&
        this.source.includes('"purchase_charge_links"')
      ) {
        interleaved = true;
        raceConnection.prepare('DELETE FROM purchase_charges WHERE id = ?').run(chargeToDelete.id);
      }
      return result;
    });

    try {
      const result = listPurchasesForTransaction(opened.db, transactionUri);

      expect(interleaved).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]?.charges).toHaveLength(2);
      expect(result[0]?.linkedCents).toBe(-1000);
    } finally {
      spy.mockRestore();
      raceConnection.close();
      temp.cleanup();
    }
  });
});
