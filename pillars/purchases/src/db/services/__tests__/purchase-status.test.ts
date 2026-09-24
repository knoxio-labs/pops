/**
 * `deriveStatus` and the two ways it gets applied: `recomputePurchaseStatuses`
 * (the sweep's own transaction touches every order it considered) and
 * `recomputeStatusForCharges` (the confirm/reject/unlink decisions know only
 * a charge, not its order).
 *
 * POPS-4612: nothing ever recomputed `purchases.status` from
 * `purchase_charge_links` before this — these are the tests that would have
 * caught that regressing again.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../__tests__/helpers.js';
import {
  createPurchase,
  getPurchase,
  purchaseChargeLinks,
  purchaseCharges,
  setPurchaseStatus,
} from '../../index.js';
import { selectChargeDetails } from '../purchase-read-charges.js';
import {
  deriveStatus,
  recomputePurchaseStatuses,
  recomputeStatusForCharges,
} from '../purchase-status.js';

import type { PurchaseStatus } from '../../../contract/constants.js';
import type { OpenedPurchasesDb } from '../../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

/** Attach a finance link to the charge with the given source ref. Unconfirmed unless told otherwise. */
function linkCharge(
  purchaseId: string,
  sourceChargeRef: string,
  uri: string,
  confirmedAt: string | null = null
): void {
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
      confirmedAt,
    })
    .run();
}

/** deriveStatus against the real, currently-stored charges and links for `purchaseId`. */
function deriveStoredStatus(
  purchaseId: string,
  status: PurchaseStatus,
  totalCents: number
): PurchaseStatus {
  const details = selectChargeDetails(opened.db, purchaseId);
  const charges = details.map((d) => d.charge);
  const linksByChargeId = new Map(details.map((d) => [d.charge.id, d.links]));
  return deriveStatus(status, totalCents, charges, linksByChargeId);
}

describe('deriveStatus', () => {
  it('is awaiting_settlement for an order with no links at all', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:no-links',
        totalCents: 5000,
        charges: [{ sourceChargeRef: 'c1', amountCents: 5000, role: 'capture' }],
      })
    );
    expect(deriveStoredStatus(id, 'awaiting_settlement', 5000)).toBe('awaiting_settlement');
  });

  it('is linked once its links cover the full total', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:full',
        totalCents: 5000,
        charges: [{ sourceChargeRef: 'c1', amountCents: 5000, role: 'capture' }],
      })
    );
    linkCharge(id, 'c1', 'pops://finance/transaction/t1');
    expect(deriveStoredStatus(id, 'awaiting_settlement', 5000)).toBe('linked');
  });

  it('an unconfirmed automatic link counts on its own — confirmation is not required', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:unconfirmed',
        totalCents: 5000,
        charges: [{ sourceChargeRef: 'c1', amountCents: 5000, role: 'capture' }],
      })
    );
    linkCharge(id, 'c1', 'pops://finance/transaction/t1', null);
    expect(deriveStoredStatus(id, 'awaiting_settlement', 5000)).toBe('linked');
  });

  it('is partial when links cover only part of the total', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:partial',
        totalCents: 5000,
        charges: [
          { sourceChargeRef: 'c1', amountCents: 3000, role: 'capture' },
          { sourceChargeRef: 'c2', amountCents: 2000, role: 'capture' },
        ],
      })
    );
    linkCharge(id, 'c1', 'pops://finance/transaction/t1');
    expect(deriveStoredStatus(id, 'awaiting_settlement', 5000)).toBe('partial');
  });

  it('a fully linked capture next to an unrelated unlinked refund still reads as linked', () => {
    // The refund is money that came back, not money that paid for the
    // order — it must not drag a fully-covered order down to `partial`.
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:refund-noop',
        totalCents: 5678,
        charges: [
          { sourceChargeRef: 'c1', amountCents: 5678, role: 'capture' },
          { sourceChargeRef: 'c2', amountCents: -1000, role: 'refund' },
        ],
      })
    );
    linkCharge(id, 'c1', 'pops://finance/transaction/t1');
    expect(deriveStoredStatus(id, 'awaiting_settlement', 5678)).toBe('linked');
  });

  it('preserves settled_cash regardless of links', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:cash',
        totalCents: 2000,
        settlementMode: 'cash',
        charges: [{ sourceChargeRef: 'c1', amountCents: 2000, role: 'capture' }],
      })
    );
    linkCharge(id, 'c1', 'pops://finance/transaction/t1');
    expect(deriveStoredStatus(id, 'settled_cash', 2000)).toBe('settled_cash');
  });

  it('preserves ignored regardless of links', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:ignored',
        totalCents: 2000,
        charges: [{ sourceChargeRef: 'c1', amountCents: 2000, role: 'capture' }],
      })
    );
    linkCharge(id, 'c1', 'pops://finance/transaction/t1');
    expect(deriveStoredStatus(id, 'ignored', 2000)).toBe('ignored');
  });
});

describe('recomputePurchaseStatuses', () => {
  it('persists the derived status through setPurchaseStatus', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:persist',
        totalCents: 4000,
        charges: [{ sourceChargeRef: 'c1', amountCents: 4000, role: 'capture' }],
      })
    );
    linkCharge(id, 'c1', 'pops://finance/transaction/t1');

    const changed = recomputePurchaseStatuses(opened.db, [id]);
    expect(changed).toBe(1);
    expect(getPurchase(opened.db, id)?.purchase.status).toBe('linked');
  });

  it('changes nothing, and reports zero changed, on a second run over the same state', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:idempotent',
        totalCents: 4000,
        charges: [{ sourceChargeRef: 'c1', amountCents: 4000, role: 'capture' }],
      })
    );
    linkCharge(id, 'c1', 'pops://finance/transaction/t1');

    recomputePurchaseStatuses(opened.db, [id]);
    const second = recomputePurchaseStatuses(opened.db, [id]);
    expect(second).toBe(0);
  });

  it('returns an order to awaiting_settlement once its only link is gone', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:unlinked',
        totalCents: 4000,
        charges: [{ sourceChargeRef: 'c1', amountCents: 4000, role: 'capture' }],
      })
    );
    linkCharge(id, 'c1', 'pops://finance/transaction/t1');
    recomputePurchaseStatuses(opened.db, [id]);
    expect(getPurchase(opened.db, id)?.purchase.status).toBe('linked');

    opened.db.delete(purchaseChargeLinks).run();
    recomputePurchaseStatuses(opened.db, [id]);
    expect(getPurchase(opened.db, id)?.purchase.status).toBe('awaiting_settlement');
  });

  it('never overwrites settled_cash or ignored even when links would say otherwise', () => {
    const cashId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:cash-recompute',
        sourceOrderId: 'a:cash-recompute',
        totalCents: 1000,
        settlementMode: 'cash',
        charges: [{ sourceChargeRef: 'c1', amountCents: 1000, role: 'capture' }],
      })
    );
    linkCharge(cashId, 'c1', 'pops://finance/transaction/t1');
    recomputePurchaseStatuses(opened.db, [cashId]);
    expect(getPurchase(opened.db, cashId)?.purchase.status).toBe('settled_cash');

    const ignoredId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:ignored-recompute',
        sourceOrderId: 'a:ignored-recompute',
        totalCents: 1000,
        charges: [{ sourceChargeRef: 'c1', amountCents: 1000, role: 'capture' }],
      })
    );
    setPurchaseStatus(opened.db, ignoredId, 'ignored');
    linkCharge(ignoredId, 'c1', 'pops://finance/transaction/t1');
    recomputePurchaseStatuses(opened.db, [ignoredId]);
    expect(getPurchase(opened.db, ignoredId)?.purchase.status).toBe('ignored');
  });

  it('ignores unknown ids and empty input rather than throwing', () => {
    expect(recomputePurchaseStatuses(opened.db, [])).toBe(0);
    expect(recomputePurchaseStatuses(opened.db, ['does-not-exist'])).toBe(0);
  });
});

describe('recomputeStatusForCharges', () => {
  it('looks up the owning order from a bare charge id', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:by-charge',
        totalCents: 4000,
        charges: [{ sourceChargeRef: 'c1', amountCents: 4000, role: 'capture' }],
      })
    );
    linkCharge(id, 'c1', 'pops://finance/transaction/t1');
    const charge = opened.db
      .select()
      .from(purchaseCharges)
      .all()
      .find((c) => c.purchaseId === id);
    if (charge === undefined) throw new Error('expected a charge');

    const changed = recomputeStatusForCharges(opened.db, [charge.id]);
    expect(changed).toBe(1);
    expect(getPurchase(opened.db, id)?.purchase.status).toBe('linked');
  });
});
