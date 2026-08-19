/**
 * `listPurchasesForTransaction` — the link table read backwards.
 *
 * Exercised elsewhere only through the REST route
 * (`api/rest/__tests__/reconcile-handlers.test.ts`), which never drives two
 * charges on the SAME order into one transaction — the accumulating branch
 * below. A combined settlement across two orders is a modelled case per the
 * docstring; two charges of one order sharing a settlement is the same case
 * one level down and deserves the same coverage.
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
import type { OpenedPurchasesDb } from '../index.js';

function link(chargeId: string, transactionUri: string, amountCents: number): ProposedLink {
  return {
    chargeId,
    transactionUri,
    transactionDescription: 'AMAZON',
    amountCents,
    linkType: 'exact',
    confidence: 1,
  };
}

describe('listPurchasesForTransaction', () => {
  it('returns nothing for a transaction URI no link references', () => {
    const temp = openTempDb();
    expect(listPurchasesForTransaction(temp.opened.db, 'pops://finance/transaction/none')).toEqual(
      []
    );
    temp.cleanup();
  });

  it('accumulates two charges from the SAME order under one entry', () => {
    const temp = openTempDb();
    const opened: OpenedPurchasesDb = temp.opened;
    seedAmazonSource(opened);

    const orderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:split-charges',
        sourceOrderId: 'amazon-split-charges',
        totalCents: 6000,
        charges: [
          { sourceChargeRef: 'c1', amountCents: 4000, role: 'capture' },
          { sourceChargeRef: 'c2', amountCents: 2000, role: 'capture' },
        ],
      })
    );
    const charges = listSolvableCharges(opened.db, { source: 'amazon' }).filter(
      (c) => c.purchaseId === orderId
    );
    expect(charges).toHaveLength(2);

    const transactionUri = 'pops://finance/transaction/combined';
    persistProposedLinks(
      opened.db,
      charges.map((charge) => link(charge.id, transactionUri, -charge.amountCents))
    );

    const result = listPurchasesForTransaction(opened.db, transactionUri);

    expect(result).toHaveLength(1);
    expect(result[0]?.purchase.id).toBe(orderId);
    expect(result[0]?.charges).toHaveLength(2);
    expect(result[0]?.linkedCents).toBe(-6000);

    temp.cleanup();
  });

  it('groups a combined settlement across two different orders separately', () => {
    const temp = openTempDb();
    const opened: OpenedPurchasesDb = temp.opened;
    seedAmazonSource(opened);

    const firstOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:combined-a',
        sourceOrderId: 'amazon-combined-a',
        orderedAt: '2026-01-01T00:00:00Z',
        totalCents: 1000,
        charges: [{ sourceChargeRef: 'ca', amountCents: 1000, role: 'capture' }],
      })
    );
    const secondOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:combined-b',
        sourceOrderId: 'amazon-combined-b',
        orderedAt: '2026-01-02T00:00:00Z',
        totalCents: 2000,
        charges: [{ sourceChargeRef: 'cb', amountCents: 2000, role: 'capture' }],
      })
    );

    const charges = listSolvableCharges(opened.db, { source: 'amazon' });
    const firstCharge = charges.find((c) => c.purchaseId === firstOrderId);
    const secondCharge = charges.find((c) => c.purchaseId === secondOrderId);
    if (firstCharge === undefined || secondCharge === undefined) {
      throw new Error('expected both orders to have solvable charges');
    }

    const transactionUri = 'pops://finance/transaction/two-orders';
    persistProposedLinks(opened.db, [
      link(firstCharge.id, transactionUri, -1000),
      link(secondCharge.id, transactionUri, -2000),
    ]);

    const result = listPurchasesForTransaction(opened.db, transactionUri);

    expect(result).toHaveLength(2);
    // Newest order first.
    expect(result[0]?.purchase.id).toBe(secondOrderId);
    expect(result[1]?.purchase.id).toBe(firstOrderId);

    temp.cleanup();
  });
});
