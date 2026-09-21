/**
 * `monthSummary` is a thin fold over `rollUpMerchantSpend` and
 * `countPurchases`, so what is worth pinning here is the composition: that
 * a second currency does not fold into the first, that an empty month reads
 * as empty rather than throwing, that "no previous month" is `null` and not
 * an empty array, and that the unmatched count tracks settlement status
 * rather than every order in the window.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../__tests__/helpers.js';
import { createPurchase, setPurchaseStatus } from '../../index.js';
import { monthSummary } from '../month-summary.js';

import type { CreatePurchaseInput, OpenedPurchasesDb } from '../../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

let nextOrder = 0;

function order(overrides: Partial<CreatePurchaseInput>): CreatePurchaseInput {
  nextOrder += 1;
  return amazonOrder({
    checksum: `month-summary-${nextOrder}`,
    sourceOrderId: `order-${nextOrder}`,
    ...overrides,
  });
}

describe('monthSummary', () => {
  it('keeps two currencies apart rather than one cross-currency total', () => {
    createPurchase(
      opened.db,
      order({ orderedAt: '2026-08-15T01:00:00Z', currency: 'AUD', totalCents: 1000 })
    );
    createPurchase(
      opened.db,
      order({ orderedAt: '2026-08-15T01:00:00Z', currency: 'USD', totalCents: 2000 })
    );

    const summary = monthSummary(opened.db, '2026-08');

    expect(summary.totals).toHaveLength(2);
    const byCurrency = new Map(summary.totals.map((entry) => [entry.currency, entry]));
    expect(byCurrency.get('AUD')?.accounting.totalCents).toBe(1000);
    expect(byCurrency.get('USD')?.accounting.totalCents).toBe(2000);
    expect(summary.purchaseCount).toBe(2);
  });

  it('answers an empty month as empty rather than throwing', () => {
    const summary = monthSummary(opened.db, '2026-08');

    expect(summary.totals).toEqual([]);
    expect(summary.purchaseCount).toBe(0);
    expect(summary.unmatchedCount).toBe(0);
    expect(summary.merchantLeaders).toEqual([]);
    // No orders in July either, so there is nothing to compare against.
    expect(summary.previousMonthTotals).toBeNull();
  });

  it('reports the previous month only when it has orders, and null otherwise', () => {
    createPurchase(
      opened.db,
      order({ orderedAt: '2026-07-10T01:00:00Z', currency: 'AUD', totalCents: 500 })
    );
    createPurchase(
      opened.db,
      order({ orderedAt: '2026-08-15T01:00:00Z', currency: 'AUD', totalCents: 1000 })
    );

    const summary = monthSummary(opened.db, '2026-08');

    expect(summary.previousMonthTotals).not.toBeNull();
    expect(summary.previousMonthTotals?.[0]?.accounting.totalCents).toBe(500);
  });

  it('counts unmatched orders by settlement status, not by everything in the window', () => {
    const awaiting = createPurchase(opened.db, order({ orderedAt: '2026-08-05T01:00:00Z' }));
    const partial = createPurchase(opened.db, order({ orderedAt: '2026-08-06T01:00:00Z' }));
    const settled = createPurchase(opened.db, order({ orderedAt: '2026-08-07T01:00:00Z' }));
    setPurchaseStatus(opened.db, partial, 'partial');
    setPurchaseStatus(opened.db, settled, 'linked');
    expect(awaiting).toBeTruthy();

    const summary = monthSummary(opened.db, '2026-08');

    expect(summary.purchaseCount).toBe(3);
    expect(summary.unmatchedCount).toBe(2);
  });

  it('excludes an order placed just before the local month boundary', () => {
    // 2026-08-01T00:00:00 in Sydney (AEST, +10) is 2026-07-31T14:00:00Z. One
    // millisecond earlier is still July in Sydney even though the UTC date
    // has already turned to the 31st, which is the whole reason this is
    // computed in the owner's timezone rather than in UTC.
    createPurchase(opened.db, order({ orderedAt: '2026-07-31T13:59:59.999Z', totalCents: 111 }));
    createPurchase(opened.db, order({ orderedAt: '2026-07-31T14:00:00.000Z', totalCents: 222 }));

    const july = monthSummary(opened.db, '2026-07');
    const august = monthSummary(opened.db, '2026-08');

    expect(july.purchaseCount).toBe(1);
    expect(july.totals[0]?.accounting.totalCents).toBe(111);
    expect(august.purchaseCount).toBe(1);
    expect(august.totals[0]?.accounting.totalCents).toBe(222);
  });

  it('caps the merchant leaderboard per currency rather than listing every merchant', () => {
    for (let i = 0; i < 6; i += 1) {
      createPurchase(
        opened.db,
        order({
          orderedAt: '2026-08-10T01:00:00Z',
          merchantEntityName: `Merchant ${String(i)}`,
          // Distinct totals so the sixth-ranked merchant is unambiguous.
          totalCents: 1000 - i * 10,
        })
      );
    }

    const summary = monthSummary(opened.db, '2026-08');

    expect(summary.merchantLeaders).toHaveLength(5);
    expect(summary.merchantLeaders.map((leader) => leader.merchant.name)).not.toContain(
      'Merchant 5'
    );
  });
});
