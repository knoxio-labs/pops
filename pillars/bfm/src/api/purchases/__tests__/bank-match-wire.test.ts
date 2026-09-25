/**
 * The bank-match mapping alone (POPS-4646): `purchases`' charges, links and
 * accounting split onto the mobile shapes, with finance's description of
 * each transaction joined in by id. `mobile-purchases-bank-match.test.ts`
 * drives it end to end through the app and the gateway.
 */
import { describe, expect, it } from 'vitest';

import {
  financeTransactionId,
  matchedTransactionIds,
  toMobileAccounting,
  toMobileCharges,
  type PurchasesChargeDetail,
} from '../bank-match-wire.js';

import type { MobileMatchedTransaction } from '../../../contract/mobile-purchase-bank-match-schemas.js';

function charge(
  overrides: Partial<PurchasesChargeDetail['charge']> = {},
  links: PurchasesChargeDetail['links'] = []
): PurchasesChargeDetail {
  return {
    charge: {
      id: 'chg-1',
      amountCents: 24_900,
      currency: 'AUD',
      chargedAt: null,
      role: 'capture',
      origin: 'merchant',
      ...overrides,
    },
    links,
  };
}

function link(
  overrides: Partial<PurchasesChargeDetail['links'][number]> = {}
): PurchasesChargeDetail['links'][number] {
  return {
    id: 'lnk-1',
    transactionUri: 'pops://finance/transaction/tx-1',
    amountCents: 24_900,
    confirmedAt: null,
    ...overrides,
  };
}

const IKEA_TX: MobileMatchedTransaction = {
  description: 'IKEA RHODES',
  date: '2026-09-02',
  amount: -249,
  currency: 'AUD',
  accountName: 'Up Everyday',
};

describe('financeTransactionId', () => {
  it('reads the id out of a finance transaction URI', () => {
    expect(financeTransactionId('pops://finance/transaction/tx-42')).toBe('tx-42');
  });

  it('refuses a URI that names something other than a finance transaction', () => {
    expect(financeTransactionId('pops://purchases/receipt/abc')).toBeNull();
    expect(financeTransactionId('pops://finance/account/acc-1')).toBeNull();
    expect(financeTransactionId('not a uri')).toBeNull();
  });
});

describe('matchedTransactionIds', () => {
  it('collects every distinct finance id across charges, once each, in first-seen order', () => {
    const ids = matchedTransactionIds([
      charge({ id: 'chg-1' }, [
        link({ id: 'l1', transactionUri: 'pops://finance/transaction/tx-2' }),
        link({ id: 'l2', transactionUri: 'pops://finance/transaction/tx-1' }),
      ]),
      charge({ id: 'chg-2' }, [
        link({ id: 'l3', transactionUri: 'pops://finance/transaction/tx-2' }),
        link({ id: 'l4', transactionUri: 'pops://purchases/receipt/abc' }),
      ]),
    ]);

    expect(ids).toEqual(['tx-2', 'tx-1']);
  });

  it('is empty for an order with no links', () => {
    expect(matchedTransactionIds([charge()])).toEqual([]);
  });
});

describe('toMobileCharges', () => {
  it('maps a fully matched charge, naming the transaction finance described', () => {
    const [mapped] = toMobileCharges(
      [charge({}, [link({ confirmedAt: '2026-09-03T01:00:00.000Z' })])],
      600,
      new Map([['tx-1', IKEA_TX]])
    );

    expect(mapped).toEqual({
      id: 'chg-1',
      amountCents: 24_900,
      currency: 'AUD',
      role: 'capture',
      origin: 'merchant',
      chargedOn: null,
      matches: [
        {
          id: 'lnk-1',
          transactionId: 'tx-1',
          amountCents: 24_900,
          matchedBy: 'confirmed',
          transaction: IKEA_TX,
        },
      ],
    });
  });

  it('calls a link nobody confirmed automatic', () => {
    const [mapped] = toMobileCharges([charge({}, [link()])], 600, new Map([['tx-1', IKEA_TX]]));

    expect(mapped?.matches[0]?.matchedBy).toBe('automatic');
  });

  it('keeps a partial match to the linked amount, not the charge amount', () => {
    const [mapped] = toMobileCharges(
      [charge({ amountCents: 24_900 }, [link({ amountCents: 10_000 })])],
      600,
      new Map([['tx-1', IKEA_TX]])
    );

    expect(mapped?.amountCents).toBe(24_900);
    expect(mapped?.matches.map((m) => m.amountCents)).toEqual([10_000]);
  });

  it('answers an unmatched charge with no matches', () => {
    const [mapped] = toMobileCharges([charge()], 600, new Map());

    expect(mapped?.matches).toEqual([]);
  });

  it('keeps a link finance did not describe, with its own amount and a null transaction', () => {
    const [mapped] = toMobileCharges([charge({}, [link()])], 600, new Map());

    expect(mapped?.matches).toEqual([
      {
        id: 'lnk-1',
        transactionId: 'tx-1',
        amountCents: 24_900,
        matchedBy: 'automatic',
        transaction: null,
      },
    ]);
  });

  it('does not describe a non-finance link from a same-id finance transaction', () => {
    const [mapped] = toMobileCharges(
      [charge({}, [link({ transactionUri: 'pops://other/transaction/tx-1' })])],
      600,
      new Map([['tx-1', IKEA_TX]])
    );

    expect(mapped?.matches[0]).toMatchObject({ transactionId: null, transaction: null });
  });

  it('dates a charge at the order’s own offset, not at UTC', () => {
    const [mapped] = toMobileCharges(
      [charge({ chargedAt: '2026-09-01T22:30:00.000Z' })],
      600,
      new Map()
    );

    expect(mapped?.chargedOn).toBe('2026-09-02');
  });

  it('carries role and origin verbatim, including values it does not know', () => {
    const [mapped] = toMobileCharges(
      [charge({ role: 'chargeback', origin: 'derived' })],
      null,
      new Map()
    );

    expect(mapped).toMatchObject({ role: 'chargeback', origin: 'derived' });
  });
});

describe('toMobileAccounting', () => {
  it('mirrors every figure of the split, field for field', () => {
    const split = {
      totalCents: 24_900,
      matchedCents: 10_000,
      awaitingImportCents: 4_900,
      residualCents: 10_000,
      refundedCents: 1_179,
      netSpendCents: 23_721,
    };

    expect(toMobileAccounting(split)).toEqual(split);
  });
});
