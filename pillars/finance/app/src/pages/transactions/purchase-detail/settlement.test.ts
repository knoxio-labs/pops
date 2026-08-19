import { describe, expect, it } from 'vitest';

import { hasUnconfirmedLink, summariseSettlement } from './settlement';

import type { LinkedCharge, LinkedPurchase } from './types';

function charge(overrides: {
  id?: string;
  amountCents?: number;
  linkCents?: number;
  currency?: string;
  confirmedAt?: string | null;
}): LinkedCharge {
  const amountCents = overrides.amountCents ?? 4128;
  return {
    charge: {
      amountCents,
      chargedAt: '2026-03-05T00:00:00.000Z',
      createdAt: '2026-03-05T00:00:00.000Z',
      currency: overrides.currency ?? 'AUD',
      id: overrides.id ?? 'chg-1',
      orderAmountCents: amountCents,
      origin: 'merchant',
      paymentHint: null,
      position: 0,
      purchaseId: 'order-1',
      role: 'capture',
      shipmentId: null,
      sourceChargeRef: null,
      updatedAt: '2026-03-05T00:00:00.000Z',
    },
    link: {
      amountCents: overrides.linkCents ?? amountCents,
      chargeId: overrides.id ?? 'chg-1',
      confidence: 1,
      confirmedAt: overrides.confirmedAt === undefined ? null : overrides.confirmedAt,
      createdAt: '2026-03-06T00:00:00.000Z',
      id: `lnk-${overrides.id ?? 'chg-1'}`,
      linkType: 'exact',
      matchRuleId: null,
      transactionUri: 'pops://finance/transaction/t1',
    },
  };
}

function entry(id: string, charges: LinkedCharge[], currency = 'AUD'): LinkedPurchase {
  return {
    charges,
    linkedCents: charges.reduce((sum, c) => sum + c.link.amountCents, 0),
    purchase: {
      checksum: `sha256-${id}`,
      createdAt: '2026-03-05T00:00:00.000Z',
      currency,
      discountCents: 0,
      id,
      ingestMethod: 'export',
      merchantEntityId: null,
      merchantEntityName: 'Amazon',
      orderedAt: '2026-03-04T00:00:00.000Z',
      paymentHint: null,
      rawRef: null,
      settlementMode: 'card',
      shippingCents: 0,
      source: 'amazon-dsar',
      sourceOrderId: `ORD-${id}`,
      status: 'linked',
      subtotalCents: 0,
      surchargeCents: 0,
      taxCents: 0,
      totalCents: 4128,
      updatedAt: '2026-03-05T00:00:00.000Z',
    },
  };
}

describe('summariseSettlement', () => {
  it('reports nothing to summarise when no order is linked', () => {
    expect(summariseSettlement([], -41.28)).toBeNull();
  });

  it('reports a fully explained transaction as a zero residual', () => {
    const summary = summariseSettlement([entry('order-1', [charge({})])], -41.28);

    expect(summary).toEqual({
      kind: 'settled',
      currency: 'AUD',
      linkedCents: 4128,
      orderCount: 1,
      transactionCents: 4128,
      unaccountedCents: 0,
    });
  });

  it('surfaces the part of the transaction no order explains', () => {
    const summary = summariseSettlement(
      [entry('order-1', [charge({ amountCents: 3000 })])],
      -41.28
    );

    expect(summary).toMatchObject({ linkedCents: 3000, unaccountedCents: 1128 });
  });

  it('sums every order of a combined settlement rather than reporting the first', () => {
    const summary = summariseSettlement(
      [
        entry('order-1', [charge({ id: 'chg-1', amountCents: 4128 })]),
        entry('order-2', [charge({ id: 'chg-2', amountCents: 1872 })]),
      ],
      -60
    );

    expect(summary).toMatchObject({ orderCount: 2, linkedCents: 6000, unaccountedCents: 0 });
  });

  it('leaves an over-claimed transaction negative instead of clamping it to zero', () => {
    const summary = summariseSettlement(
      [entry('order-1', [charge({ amountCents: 5000 })])],
      -41.28
    );

    expect(summary).toMatchObject({ unaccountedCents: -872 });
  });

  it('compares magnitudes, so the two sides signing an expense differently cannot invent a residual', () => {
    const positive = summariseSettlement([entry('order-1', [charge({})])], 41.28);
    const negative = summariseSettlement([entry('order-1', [charge({})])], -41.28);

    expect(positive).toMatchObject({ unaccountedCents: 0 });
    expect(negative).toMatchObject({ unaccountedCents: 0 });
  });

  it('rounds the dollar amount rather than truncating it, so no phantom cent appears', () => {
    const summary = summariseSettlement(
      [entry('order-1', [charge({ amountCents: 1999 })])],
      -19.99
    );

    expect(summary).toMatchObject({ transactionCents: 1999, unaccountedCents: 0 });
  });

  it('names the currency the charges settled in, not the order currency', () => {
    const usdOrder = entry('order-1', [charge({ currency: 'AUD' })], 'USD');
    const summary = summariseSettlement([usdOrder], -41.28);

    expect(summary?.kind).toBe('settled');
    expect(summary).toMatchObject({ currency: 'AUD' });
  });

  it('refuses to add charges that settled in different currencies', () => {
    const summary = summariseSettlement(
      [
        entry('order-1', [charge({ id: 'chg-1', amountCents: 4128, currency: 'AUD' })]),
        entry('order-2', [charge({ id: 'chg-2', amountCents: 1872, currency: 'USD' })]),
      ],
      -60
    );

    expect(summary).toEqual({
      kind: 'mixed-currency',
      orderCount: 2,
      currencies: ['AUD', 'USD'],
    });
  });

  it('refuses a mixed-currency sum within a single order too', () => {
    const summary = summariseSettlement(
      [
        entry('order-1', [
          charge({ id: 'chg-1', amountCents: 3000, currency: 'AUD' }),
          charge({ id: 'chg-2', amountCents: 1128, currency: 'NZD' }),
        ]),
      ],
      -41.28
    );

    expect(summary?.kind).toBe('mixed-currency');
  });

  it('cancels a refund against a capture instead of adding their magnitudes', () => {
    const summary = summariseSettlement(
      [
        entry('order-1', [charge({ id: 'chg-1', amountCents: 5000 })]),
        entry('order-2', [charge({ id: 'chg-2', amountCents: -872 })]),
      ],
      -41.28
    );

    expect(summary).toMatchObject({ linkedCents: 4128, unaccountedCents: 0 });
  });
});

describe('hasUnconfirmedLink', () => {
  it('is false when every link was confirmed by a human', () => {
    const confirmed = entry('order-1', [charge({ confirmedAt: '2026-03-07T00:00:00.000Z' })]);

    expect(hasUnconfirmedLink(confirmed)).toBe(false);
  });

  it('is true when one link among several is still the matcher’s belief', () => {
    const mixed = entry('order-1', [
      charge({ id: 'chg-1', confirmedAt: '2026-03-07T00:00:00.000Z' }),
      charge({ id: 'chg-2', confirmedAt: null }),
    ]);

    expect(hasUnconfirmedLink(mixed)).toBe(true);
  });
});
