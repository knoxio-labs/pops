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
  updatePurchase,
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

  it('is nothing_to_settle for a zero-total order with no charges at all', () => {
    const id = createPurchase(opened.db, amazonOrder({ checksum: 'a:zero-bare', totalCents: 0 }));
    expect(deriveStoredStatus(id, 'awaiting_settlement', 0)).toBe('nothing_to_settle');
  });

  it('a zero-total order with a refund charge stays awaiting_settlement — the refund still needs matching', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:zero-refund',
        totalCents: 0,
        charges: [{ sourceChargeRef: 'c1', amountCents: -500, role: 'refund' }],
      })
    );
    expect(deriveStoredStatus(id, 'awaiting_settlement', 0)).toBe('awaiting_settlement');
  });

  it('a non-zero total is never nothing_to_settle regardless of charges', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({ checksum: 'a:nonzero-bare', totalCents: 5000 })
    );
    expect(deriveStoredStatus(id, 'awaiting_settlement', 5000)).toBe('awaiting_settlement');
  });

  it('preserves settled_cash on a zero-total order', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({ checksum: 'a:zero-cash', totalCents: 0, settlementMode: 'cash' })
    );
    expect(deriveStoredStatus(id, 'settled_cash', 0)).toBe('settled_cash');
  });

  it('preserves ignored on a zero-total order', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({ checksum: 'a:zero-ignored', totalCents: 0 })
    );
    expect(deriveStoredStatus(id, 'ignored', 0)).toBe('ignored');
  });
});

describe('nothing_to_settle — leaving and re-entering', () => {
  it('a zero-total order that later gets a non-zero total derives normally again', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({ checksum: 'a:zero-then-total', totalCents: 0 })
    );
    expect(deriveStoredStatus(id, 'nothing_to_settle', 0)).toBe('nothing_to_settle');
    expect(deriveStoredStatus(id, 'nothing_to_settle', 1999)).toBe('awaiting_settlement');
  });

  it('a zero-total order that later gets a capture charge derives normally again', () => {
    // A non-zero charge amount, deliberately: a linked charge of exactly 0
    // cents reads as `awaiting_settlement` under the ordinary coverage rule
    // (`matchedCents <= 0`) regardless of this feature, so a 0-cent charge
    // here would test that pre-existing edge case rather than this one —
    // whether leaving `nothing_to_settle` hands back to the ordinary rule.
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:zero-then-capture',
        totalCents: 0,
        charges: [{ sourceChargeRef: 'c1', amountCents: 500, role: 'capture' }],
      })
    );
    linkCharge(id, 'c1', 'pops://finance/transaction/t1');
    expect(deriveStoredStatus(id, 'nothing_to_settle', 0)).toBe('linked');
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

describe('createPurchase — status derives from the moment the order exists', () => {
  it('a zero-total order is nothing_to_settle from creation, with no sweep involved', () => {
    const id = createPurchase(opened.db, amazonOrder({ checksum: 'a:create-zero', totalCents: 0 }));
    expect(getPurchase(opened.db, id)?.purchase.status).toBe('nothing_to_settle');
  });

  it('a zero-total order created with a refund charge stays awaiting_settlement', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:create-zero-refund',
        totalCents: 0,
        charges: [{ sourceChargeRef: 'c1', amountCents: -500, role: 'refund' }],
      })
    );
    expect(getPurchase(opened.db, id)?.purchase.status).toBe('awaiting_settlement');
  });

  it('a non-zero-total order is unaffected — still awaiting_settlement', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({ checksum: 'a:create-nonzero', totalCents: 4000 })
    );
    expect(getPurchase(opened.db, id)?.purchase.status).toBe('awaiting_settlement');
  });

  it('a cash order is still settled_cash even at zero total', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({ checksum: 'a:create-zero-cash', totalCents: 0, settlementMode: 'cash' })
    );
    expect(getPurchase(opened.db, id)?.purchase.status).toBe('settled_cash');
  });
});

describe('updatePurchase — a total edit re-derives status in the same transaction', () => {
  it('editing an awaiting_settlement order down to a zero total moves it to nothing_to_settle', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'a:edit-to-zero',
        totalCents: 4000,
        items: [{ name: 'Widget', unitPriceCents: 4000, lineTotalCents: 4000, quantity: 1 }],
      })
    );
    const before = getPurchase(opened.db, id);
    expect(before?.purchase.status).toBe('awaiting_settlement');

    updatePurchase(opened.db, id, {
      totalCents: 0,
      lines: [],
      expectedUpdatedAt: before?.purchase.updatedAt ?? '',
    });
    expect(getPurchase(opened.db, id)?.purchase.status).toBe('nothing_to_settle');
  });

  it('editing a nothing_to_settle order up to a real total moves it back to awaiting_settlement', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({ checksum: 'a:edit-from-zero', totalCents: 0 })
    );
    const before = getPurchase(opened.db, id);
    expect(before?.purchase.status).toBe('nothing_to_settle');

    updatePurchase(opened.db, id, {
      totalCents: 2500,
      lines: [{ name: 'Widget', quantity: 1, lineTotalCents: 2500 }],
      expectedUpdatedAt: before?.purchase.updatedAt ?? '',
    });
    expect(getPurchase(opened.db, id)?.purchase.status).toBe('awaiting_settlement');
  });
});
