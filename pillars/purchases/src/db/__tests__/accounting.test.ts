/**
 * The three-way accounting split, over the shapes real merchants produce.
 *
 * These are the tests that would have caught the model being wrong: an
 * order whose charge is known but whose statement has not imported must not
 * look identical to an order nobody has ever paid for.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPurchase, getPurchase, purchaseChargeLinks, purchaseCharges } from '../index.js';
import { amazonOrder, coffeeOrder, openTempDb, seedAmazonSource } from './helpers.js';

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

/** Attach a finance transaction to the charge with the given source ref. */
function matchCharge(purchaseId: string, sourceChargeRef: string, uri: string): void {
  const charge = opened.db
    .select()
    .from(purchaseCharges)
    .all()
    .find((c) => c.purchaseId === purchaseId && c.sourceChargeRef === sourceChargeRef);
  if (charge === undefined) throw new Error(`no charge ${sourceChargeRef}`);
  opened.db
    .insert(purchaseChargeLinks)
    .values({
      chargeId: charge.id,
      transactionUri: uri,
      amountCents: charge.amountCents,
      linkType: 'exact',
    })
    .run();
}

describe('a charge the bank has not caught up with', () => {
  it('is awaiting import, not a residual', () => {
    const id = createPurchase(opened.db, coffeeOrder());
    const { accounting } = getPurchase(opened.db, id) ?? { accounting: null };

    // The merchant told us $56.78 was charged. Finance has not imported the
    // statement. Nothing is wrong and nothing needs a human.
    expect(accounting).toEqual({
      totalCents: 5678,
      matchedCents: 0,
      awaitingImportCents: 5678,
      residualCents: 0,
      refundedCents: 0,
      netSpendCents: 5678,
    });
  });

  it('moves to matched once the transaction lands, with the residual untouched', () => {
    const id = createPurchase(opened.db, coffeeOrder());
    matchCharge(id, 'chg-1', 'pops://finance/transaction/t1');

    expect(getPurchase(opened.db, id)?.accounting).toEqual({
      totalCents: 5678,
      matchedCents: 5678,
      awaitingImportCents: 0,
      residualCents: 0,
      refundedCents: 0,
      netSpendCents: 5678,
    });
  });
});

describe('an order with no charge asserted at all', () => {
  it('is entirely residual, and still cost what the merchant said it cost', () => {
    // Nobody has claimed this money, so all of it is unexplained — but the
    // merchant stated the total at ingest, and net spend reports that rather
    // than waiting for a charge to appear.
    const id = createPurchase(opened.db, amazonOrder({ totalCents: 5678 }));

    expect(getPurchase(opened.db, id)?.accounting).toEqual({
      totalCents: 5678,
      matchedCents: 0,
      awaitingImportCents: 0,
      residualCents: 5678,
      refundedCents: 0,
      netSpendCents: 5678,
    });
  });
});

describe('gift card part-payment', () => {
  it('leaves a permanent residual no transaction will ever explain', () => {
    // $56.78 ordered; $40.00 hit the card; $16.78 came off a gift balance.
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 5678,
        charges: [{ sourceChargeRef: 'chg-1', amountCents: 4000 }],
      })
    );
    matchCharge(id, 'chg-1', 'pops://finance/transaction/t1');

    // The $16.78 off the gift balance is money spent, not money that never
    // moved: it stays in the residual because no charge accounts for it, and
    // it stays in net spend because the order still cost $56.78.
    expect(getPurchase(opened.db, id)?.accounting).toEqual({
      totalCents: 5678,
      matchedCents: 4000,
      awaitingImportCents: 0,
      residualCents: 1678,
      refundedCents: 0,
      netSpendCents: 5678,
    });
  });
});

describe('an authorization and its capture', () => {
  it('counts once, not twice', () => {
    // The hold and the capture are two records of one payment. Counting
    // both would drive the residual to -5678 and make a correctly-settled
    // order look doubly paid.
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 5678,
        charges: [
          { sourceChargeRef: 'auth', amountCents: 5678, role: 'authorization' },
          { sourceChargeRef: 'cap', amountCents: 5678, role: 'capture' },
        ],
      })
    );
    matchCharge(id, 'auth', 'pops://finance/transaction/hold');
    matchCharge(id, 'cap', 'pops://finance/transaction/capture');

    expect(getPurchase(opened.db, id)?.accounting).toEqual({
      totalCents: 5678,
      matchedCents: 5678,
      awaitingImportCents: 0,
      residualCents: 0,
      refundedCents: 0,
      netSpendCents: 5678,
    });
  });
});

describe('a refund', () => {
  it('is its own bucket, and does not masquerade as unexplained money', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 5678,
        charges: [
          { sourceChargeRef: 'cap', amountCents: 5678 },
          { sourceChargeRef: 'ref', amountCents: -1179, role: 'refund' },
        ],
      })
    );
    matchCharge(id, 'cap', 'pops://finance/transaction/capture');
    matchCharge(id, 'ref', 'pops://finance/transaction/refund');

    // The order was charged in full and $11.79 came back. Nothing is
    // unexplained — an earlier version reported residual 1179 here, which
    // presented returned money as missing money and made getting a refund
    // raise the "something is wrong" number.
    expect(getPurchase(opened.db, id)?.accounting).toEqual({
      totalCents: 5678,
      matchedCents: 5678,
      awaitingImportCents: 0,
      residualCents: 0,
      refundedCents: 1179,
      netSpendCents: 4499,
    });
  });

  it('reads as unexplained, not as negative spend, when it is the only charge', () => {
    // The shape every refunded Amazon order arrives in: the export publishes
    // what came back and never what was paid. The order still cost $52.20
    // less the $45.20 that came back, and the fact that nothing proves the
    // payment is what the residual is for.
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 5220,
        charges: [{ sourceChargeRef: 'ref', amountCents: -4520, role: 'refund' }],
      })
    );

    expect(getPurchase(opened.db, id)?.accounting).toEqual({
      totalCents: 5220,
      matchedCents: 0,
      awaitingImportCents: 0,
      residualCents: 5220,
      refundedCents: 4520,
      netSpendCents: 700,
    });
  });

  it('drives net spend negative when it genuinely exceeds the order total', () => {
    // An over-refund is a real thing a merchant can do, and the only signal
    // it happened is the sign. Clamping here would hide it, exactly as
    // clamping the residual would hide over-charging (ADR-042).
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 5678,
        charges: [
          { sourceChargeRef: 'cap', amountCents: 5678 },
          { sourceChargeRef: 'ref', amountCents: -6000, role: 'refund' },
        ],
      })
    );

    expect(getPurchase(opened.db, id)?.accounting.netSpendCents).toBe(-322);
  });
});

describe('over-charging', () => {
  it('goes negative rather than clamping', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 5678,
        charges: [
          { sourceChargeRef: 'a', amountCents: 5678 },
          { sourceChargeRef: 'b', amountCents: 100 },
        ],
      })
    );

    expect(getPurchase(opened.db, id)?.accounting.residualCents).toBe(-100);
  });
});

describe('a foreign-currency order', () => {
  it('computes the residual in the order currency, not the settlement currency', () => {
    // USD 27.50 order settling as AUD 42.10 on the card. Comparing the AUD
    // figure against a USD total would report a wild residual.
    const id = createPurchase(
      opened.db,
      amazonOrder({
        currency: 'USD',
        totalCents: 2750,
        checksum: 'aliexpress-fx',
        charges: [
          {
            sourceChargeRef: 'chg-1',
            amountCents: 4210,
            currency: 'AUD',
            orderAmountCents: 2750,
          },
        ],
      })
    );

    const detail = getPurchase(opened.db, id);
    expect(detail?.accounting.residualCents).toBe(0);
    expect(detail?.accounting.awaitingImportCents).toBe(2750);
    // The settled figure is preserved for the matcher, which compares
    // against AUD transactions.
    expect(detail?.charges[0]?.charge.amountCents).toBe(4210);
    expect(detail?.charges[0]?.charge.currency).toBe('AUD');
  });
});

describe('charge currency consistency', () => {
  it('rejects a foreign settlement currency with no order-currency amount', () => {
    // The silent-corruption case: without orderAmountCents this used to
    // record 4210 AUD cents as though they were USD cents, and the residual
    // is computed from that number.
    expect(() =>
      createPurchase(
        opened.db,
        amazonOrder({
          currency: 'USD',
          totalCents: 2750,
          charges: [{ sourceChargeRef: 'c', amountCents: 4210, currency: 'AUD' }],
        })
      )
    ).toThrow(/orderAmountCents is required/);
  });

  it('accepts a foreign settlement currency when the order-currency amount is stated', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        currency: 'USD',
        totalCents: 2750,
        charges: [
          { sourceChargeRef: 'c', amountCents: 4210, currency: 'AUD', orderAmountCents: 2750 },
        ],
      })
    );
    expect(getPurchase(opened.db, id)?.accounting.residualCents).toBe(0);
  });

  it("rejects an order-currency amount that contradicts the order's own currency", () => {
    expect(() =>
      createPurchase(
        opened.db,
        amazonOrder({
          currency: 'AUD',
          totalCents: 5678,
          charges: [
            { sourceChargeRef: 'c', amountCents: 5678, currency: 'AUD', orderAmountCents: 9999 },
          ],
        })
      )
    ).toThrow(/differs from amountCents/);
  });

  it('defaults the order-currency amount when the charge settles in the order currency', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({ totalCents: 5678, charges: [{ sourceChargeRef: 'c', amountCents: 5678 }] })
    );
    const charge = getPurchase(opened.db, id)?.charges[0]?.charge;
    expect(charge?.orderAmountCents).toBe(5678);
    expect(charge?.currency).toBe('AUD');
  });

  it('rejects a charge allocating to the same line twice', () => {
    expect(() =>
      createPurchase(
        opened.db,
        amazonOrder({
          items: [{ ref: 'a', name: 'A', unitPriceCents: 100, lineTotalCents: 100 }],
          charges: [
            {
              sourceChargeRef: 'c',
              amountCents: 100,
              allocations: [
                { itemRef: 'a', amountCents: 60 },
                { itemRef: 'a', amountCents: 40 },
              ],
            },
          ],
        })
      )
    ).toThrow(/more than once/);
  });
});
