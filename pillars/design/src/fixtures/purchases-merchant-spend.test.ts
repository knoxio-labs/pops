import { describe, expect, it } from 'vitest';

import { merchantOrdersByKey, merchantOrderKey } from './purchases-merchant-orders';
import {
  generalStoreEntity,
  generalStoreName,
  merchantKey,
  merchantSpendGroups,
} from './purchases-merchant-spend';

describe('merchantSpendGroups', () => {
  // Literal figures rather than the constructors' own algebra: `accounting()`
  // defines the residual and `sumAccounting()` defines the total, so asserting
  // those relations back at them holds for any numbers at all. These are the
  // figures a reviewer reads off the screen.
  it('heads AUD with the figures the section shows', () => {
    const aud = merchantSpendGroups.find((group) => group.currency === 'AUD');
    expect(aud?.total).toEqual({
      currency: 'AUD',
      orderCount: 15,
      accounting: {
        totalCents: 249_830,
        matchedCents: 217_629,
        awaitingImportCents: 15_000,
        refundedCents: 5_000,
        residualCents: 17_201,
        netSpendCents: 244_830,
      },
    });
  });

  it('carries a residual too small to round away, so the share is read at its clamp', () => {
    const sliver = merchantSpendGroups
      .flatMap((group) => group.merchants)
      .filter((merchant) => merchant.accounting.residualCents > 0)
      .map((merchant) => merchant.accounting.residualCents);
    expect(Math.min(...sliver)).toBe(1);
  });

  it('carries a merchant with more linked than was ever spent', () => {
    const overLinked = merchantSpendGroups
      .flatMap((group) => group.merchants)
      .filter((merchant) => merchant.accounting.residualCents < 0);
    expect(overLinked).toHaveLength(1);
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

  it('keeps an entity group and a name group with the same label from colliding', () => {
    expect(merchantKey(generalStoreEntity.merchant)).not.toBe(
      merchantKey(generalStoreName.merchant)
    );
    expect(merchantOrderKey(generalStoreEntity)).not.toBe(merchantOrderKey(generalStoreName));
  });
});
