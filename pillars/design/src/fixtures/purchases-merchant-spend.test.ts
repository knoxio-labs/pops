import { describe, expect, it } from 'vitest';

import {
  merchantKey,
  merchantOrderKey,
  merchantOrdersByKey,
  merchantSpendGroups,
} from './purchases-merchant-spend';

describe('merchantSpendGroups', () => {
  it("sums each currency's total component-wise from its own merchants", () => {
    for (const group of merchantSpendGroups) {
      if (group.total === null) continue;
      const summed = group.merchants.reduce(
        (sum, merchant) => sum + merchant.accounting.totalCents,
        0
      );
      expect(group.total.accounting.totalCents).toBe(summed);
      expect(group.total.orderCount).toBe(
        group.merchants.reduce((sum, merchant) => sum + merchant.orderCount, 0)
      );
    }
  });

  it('keeps the explained/unexplained split consistent: residual plus explained equals the total', () => {
    for (const group of merchantSpendGroups) {
      for (const merchant of group.merchants) {
        const { totalCents, residualCents, matchedCents, awaitingImportCents } =
          merchant.accounting;
        expect(matchedCents + awaitingImportCents + residualCents).toBe(totalCents);
      }
    }
  });

  it('includes at least one merchant with a genuine, non-zero residual', () => {
    const hasUnexplained = merchantSpendGroups.some((group) =>
      group.merchants.some((merchant) => merchant.accounting.residualCents > 0)
    );
    expect(hasUnexplained).toBe(true);
  });

  it('spans more than one currency', () => {
    expect(merchantSpendGroups.length).toBeGreaterThan(1);
  });
});

describe('merchantOrderKey', () => {
  it('keeps two unattributed groups in different currencies from colliding', () => {
    const aud = merchantSpendGroups.find((group) => group.currency === 'AUD');
    const usd = merchantSpendGroups.find((group) => group.currency === 'USD');
    const audUnattributed = aud?.merchants.find((m) => m.merchant.resolution === 'unattributed');
    const usdUnattributed = usd?.merchants.find((m) => m.merchant.resolution === 'unattributed');
    expect(audUnattributed).toBeDefined();
    expect(usdUnattributed).toBeDefined();
    if (audUnattributed === undefined || usdUnattributed === undefined) return;

    expect(merchantKey(audUnattributed.merchant)).toBe(merchantKey(usdUnattributed.merchant));
    expect(merchantOrderKey(audUnattributed)).not.toBe(merchantOrderKey(usdUnattributed));
  });

  it('has an order list entry for every merchant in every group', () => {
    for (const group of merchantSpendGroups) {
      for (const merchant of group.merchants) {
        expect(merchantOrdersByKey[merchantOrderKey(merchant)]).toBeDefined();
      }
    }
  });
});
