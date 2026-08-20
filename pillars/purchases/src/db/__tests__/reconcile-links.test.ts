/**
 * `listPurchasesForTransaction` — the order its answer comes back in.
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
import { describe, expect, it } from 'vitest';

import {
  createPurchase,
  listPurchasesForTransaction,
  listSolvableCharges,
  persistProposedLinks,
} from '../index.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { ProposedLink } from '../../reconcile/types.js';

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
});
