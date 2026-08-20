/**
 * `chargeIdsForPurchases` — scoping a teardown to a set of orders.
 *
 * Every other export of `reconcile-writes.ts` is exercised through the
 * sweep and the confirm/reject routes (`sweep.test.ts`, `decisions.test.ts`).
 * This one had no caller anywhere in the pillar and no test, which is why
 * it read as dead code in coverage — it is prepared for a scoped-teardown
 * caller that does not exist yet, and behaviour worth having a name for in
 * the meantime is behaviour worth pinning.
 */
import { describe, expect, it } from 'vitest';

import { chargeIdsForPurchases, createPurchase, listSolvableCharges } from '../index.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

describe('chargeIdsForPurchases', () => {
  it('returns an empty array without querying when given no purchase ids', () => {
    const temp = openTempDb();
    expect(chargeIdsForPurchases(temp.opened.db, [])).toEqual([]);
    temp.cleanup();
  });

  it('returns every charge id belonging to the given orders, and none from others', () => {
    const temp = openTempDb();
    const opened = temp.opened;
    seedAmazonSource(opened);

    const inScopeId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:in-scope',
        sourceOrderId: 'amazon-in-scope',
        charges: [
          { sourceChargeRef: 'c1', amountCents: 2000, role: 'capture' },
          { sourceChargeRef: 'c2', amountCents: 3678, role: 'capture' },
        ],
      })
    );
    const outOfScopeId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:out-of-scope',
        sourceOrderId: 'amazon-out-of-scope',
        charges: [{ sourceChargeRef: 'c3', amountCents: 5678, role: 'capture' }],
      })
    );

    const chargeIdsOf = (purchaseId: string): string[] =>
      listSolvableCharges(opened.db)
        .filter((charge) => charge.purchaseId === purchaseId)
        .map((charge) => charge.id)
        .toSorted();
    const inScopeChargeIds = chargeIdsOf(inScopeId);
    const outOfScopeChargeIds = chargeIdsOf(outOfScopeId);
    expect(inScopeChargeIds).toHaveLength(2);
    expect(outOfScopeChargeIds).toHaveLength(1);

    expect(chargeIdsForPurchases(opened.db, [inScopeId]).toSorted()).toEqual(inScopeChargeIds);

    temp.cleanup();
  });
});
