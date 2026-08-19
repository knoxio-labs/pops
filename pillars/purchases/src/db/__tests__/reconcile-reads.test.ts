/**
 * `reconcile-reads.ts` — the solver's view of the world.
 *
 * These exercise the scope filters (`source`/`from`/`to`) and the
 * eligibility predicates directly, rather than only through the sweep that
 * calls them. `sweep.test.ts` and `accounting-properties.test.ts` cover the
 * happy path of each function; this file covers the filters and exclusions
 * that decide what the solver never even sees.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  confirmLink,
  createPurchase,
  listConfirmedLinks,
  listOrdersNeedingDerivedCharge,
  listRejectedPairings,
  listSolvableCharges,
  persistProposedLinks,
  rejectLink,
  setPurchaseStatus,
} from '../index.js';
import {
  amazonOrder,
  ARRANGEMENT_TIMEOUT_MS,
  openTempDb,
  seedAmazonSource,
  seedWoolworthsSource,
} from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

describe('listSolvableCharges', () => {
  let opened: OpenedPurchasesDb;
  // A no-op until the arrangement opens something, so a build that fails
  // before it does reports its own error rather than one from teardown.
  let release: () => void = () => undefined;
  let cardOrderId: string;
  let cashOrderId: string;
  let ignoredOrderId: string;
  let woolworthsOrderId: string;

  beforeAll(() => {
    const temp = openTempDb();
    opened = temp.opened;
    release = temp.cleanup;
    seedAmazonSource(opened);
    seedWoolworthsSource(opened);

    cardOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:card',
        sourceOrderId: 'amazon-card',
        settlementMode: 'card',
        orderedAt: '2026-01-10T00:00:00Z',
        charges: [{ amountCents: 5678, role: 'capture' }],
      })
    );

    cashOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:cash',
        sourceOrderId: 'amazon-cash',
        settlementMode: 'cash',
        orderedAt: '2026-01-11T00:00:00Z',
        charges: [{ amountCents: 5678, role: 'capture' }],
      })
    );

    ignoredOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:ignored',
        sourceOrderId: 'amazon-ignored',
        settlementMode: 'card',
        orderedAt: '2026-01-12T00:00:00Z',
        charges: [{ amountCents: 5678, role: 'capture' }],
      })
    );
    setPurchaseStatus(opened.db, ignoredOrderId, 'ignored');

    woolworthsOrderId = createPurchase(opened.db, {
      source: 'woolworths',
      sourceOrderId: 'wx-1',
      ingestMethod: 'upload',
      orderedAt: '2026-02-20T00:00:00Z',
      currency: 'AUD',
      totalCents: 1234,
      checksum: 'woolworths:1',
      settlementMode: 'card',
      charges: [{ amountCents: 1234, role: 'capture' }],
    });
  }, ARRANGEMENT_TIMEOUT_MS);

  afterAll(() => {
    release();
  });

  it('excludes cash orders — a settlement will never arrive for one', () => {
    const purchaseIds = listSolvableCharges(opened.db).map((charge) => charge.purchaseId);
    expect(purchaseIds).not.toContain(cashOrderId);
  });

  it('excludes ignored orders', () => {
    const purchaseIds = listSolvableCharges(opened.db).map((charge) => charge.purchaseId);
    expect(purchaseIds).not.toContain(ignoredOrderId);
  });

  it('includes an eligible card order with no scope applied', () => {
    const purchaseIds = listSolvableCharges(opened.db).map((charge) => charge.purchaseId);
    expect(purchaseIds).toContain(cardOrderId);
    expect(purchaseIds).toContain(woolworthsOrderId);
  });

  it('scope.source restricts to that source alone', () => {
    const purchaseIds = listSolvableCharges(opened.db, { source: 'woolworths' }).map(
      (charge) => charge.purchaseId
    );
    expect(purchaseIds).toEqual([woolworthsOrderId]);
  });

  it('scope.from excludes orders before the bound', () => {
    const purchaseIds = listSolvableCharges(opened.db, { from: '2026-02-01T00:00:00Z' }).map(
      (charge) => charge.purchaseId
    );
    expect(purchaseIds).not.toContain(cardOrderId);
    expect(purchaseIds).toContain(woolworthsOrderId);
  });

  it('scope.to excludes orders after the bound', () => {
    const purchaseIds = listSolvableCharges(opened.db, { to: '2026-01-31T23:59:59Z' }).map(
      (charge) => charge.purchaseId
    );
    expect(purchaseIds).toContain(cardOrderId);
    expect(purchaseIds).not.toContain(woolworthsOrderId);
  });

  it('a from/to window combines to select exactly the orders inside it', () => {
    const purchaseIds = listSolvableCharges(opened.db, {
      from: '2026-01-10T00:00:00Z',
      to: '2026-01-10T23:59:59Z',
    }).map((charge) => charge.purchaseId);
    expect(purchaseIds).toEqual([cardOrderId]);
  });
});

describe('listOrdersNeedingDerivedCharge', () => {
  let opened: OpenedPurchasesDb;
  // A no-op until the arrangement opens something, so a build that fails
  // before it does reports its own error rather than one from teardown.
  let release: () => void = () => undefined;
  let noChargeOrderId: string;
  let capturedOrderId: string;
  let refundOnlyOrderId: string;
  let zeroTotalOrderId: string;
  let outOfWindowOrderId: string;

  beforeAll(() => {
    const temp = openTempDb();
    opened = temp.opened;
    release = temp.cleanup;
    seedAmazonSource(opened);

    noChargeOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:no-charge',
        sourceOrderId: 'amazon-no-charge',
        orderedAt: '2026-03-01T00:00:00Z',
      })
    );

    capturedOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:captured',
        sourceOrderId: 'amazon-captured',
        orderedAt: '2026-03-02T00:00:00Z',
        charges: [{ amountCents: 5678, role: 'capture' }],
      })
    );

    // A refund states what came back, never what was paid — an order whose
    // only charge is a refund still has nothing describing the payment.
    refundOnlyOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:refund-only',
        sourceOrderId: 'amazon-refund-only',
        orderedAt: '2026-03-03T00:00:00Z',
        charges: [{ amountCents: -1200, role: 'refund' }],
      })
    );

    zeroTotalOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:zero',
        sourceOrderId: 'amazon-zero',
        orderedAt: '2026-03-04T00:00:00Z',
        totalCents: 0,
      })
    );

    outOfWindowOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:out-of-window',
        sourceOrderId: 'amazon-out-of-window',
        orderedAt: '2026-05-01T00:00:00Z',
      })
    );
  }, ARRANGEMENT_TIMEOUT_MS);

  afterAll(() => {
    release();
  });

  it('includes an order with no charge at all', () => {
    const ids = listOrdersNeedingDerivedCharge(opened.db).map((order) => order.id);
    expect(ids).toContain(noChargeOrderId);
  });

  it('excludes an order a capture already claims', () => {
    const ids = listOrdersNeedingDerivedCharge(opened.db).map((order) => order.id);
    expect(ids).not.toContain(capturedOrderId);
  });

  it('includes an order whose only charge is a refund', () => {
    const ids = listOrdersNeedingDerivedCharge(opened.db).map((order) => order.id);
    expect(ids).toContain(refundOnlyOrderId);
  });

  it('excludes a zero-total order — nothing to settle', () => {
    const ids = listOrdersNeedingDerivedCharge(opened.db).map((order) => order.id);
    expect(ids).not.toContain(zeroTotalOrderId);
  });

  it('scope.source restricts to that source', () => {
    const ids = listOrdersNeedingDerivedCharge(opened.db, { source: 'amazon' }).map(
      (order) => order.id
    );
    expect(ids).toContain(noChargeOrderId);
  });

  it('scope.source excludes every order from a different source', () => {
    const ids = listOrdersNeedingDerivedCharge(opened.db, { source: 'does-not-exist' }).map(
      (order) => order.id
    );
    expect(ids).toEqual([]);
  });

  it('scope.from/scope.to narrow to the window', () => {
    const ids = listOrdersNeedingDerivedCharge(opened.db, {
      from: '2026-03-01T00:00:00Z',
      to: '2026-03-01T23:59:59Z',
    }).map((order) => order.id);
    expect(ids).toEqual([noChargeOrderId]);
    expect(ids).not.toContain(outOfWindowOrderId);
  });
});

describe('listConfirmedLinks', () => {
  it('returns the confirmed link and not the one still only proposed', () => {
    const temp = openTempDb();
    const opened = temp.opened;
    seedAmazonSource(opened);

    const confirmedOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:confirmed',
        sourceOrderId: 'amazon-confirmed',
        orderedAt: '2020-01-01T00:00:00Z',
        charges: [{ amountCents: 5678, role: 'capture' }],
      })
    );
    const proposedOrderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:proposed',
        sourceOrderId: 'amazon-proposed',
        orderedAt: '2026-06-01T00:00:00Z',
        charges: [{ amountCents: 1234, role: 'capture' }],
      })
    );
    const solvable = listSolvableCharges(opened.db, { source: 'amazon' });
    const confirmedCharge = solvable.find((c) => c.purchaseId === confirmedOrderId);
    const proposedCharge = solvable.find((c) => c.purchaseId === proposedOrderId);
    if (confirmedCharge === undefined || proposedCharge === undefined) {
      throw new Error('expected both orders to have solvable charges');
    }

    persistProposedLinks(opened.db, [
      {
        chargeId: confirmedCharge.id,
        transactionUri: 'pops://finance/transaction/1',
        transactionDescription: 'AMAZON',
        amountCents: 5678,
        linkType: 'exact',
        confidence: 1,
      },
      {
        chargeId: proposedCharge.id,
        transactionUri: 'pops://finance/transaction/2',
        transactionDescription: 'AMAZON',
        amountCents: 1234,
        linkType: 'exact',
        confidence: 1,
      },
    ]);
    confirmLink(
      opened.db,
      confirmedCharge.id,
      'pops://finance/transaction/1',
      '2026-01-01T00:00:00Z'
    );

    expect(listConfirmedLinks(opened.db)).toEqual([
      { chargeId: confirmedCharge.id, transactionUri: 'pops://finance/transaction/1' },
    ]);

    temp.cleanup();
  });
});

describe('listRejectedPairings', () => {
  it('returns an empty array without querying when given no charge ids', () => {
    const temp = openTempDb();
    expect(listRejectedPairings(temp.opened.db, [])).toEqual([]);
    temp.cleanup();
  });

  it('returns only the rejections belonging to the given charges', () => {
    const temp = openTempDb();
    const opened = temp.opened;
    seedAmazonSource(opened);

    const orderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:rejected',
        sourceOrderId: 'amazon-rejected',
        orderedAt: '2026-04-01T00:00:00Z',
        charges: [{ amountCents: 5678, role: 'capture' }],
      })
    );
    const [charge] = listSolvableCharges(opened.db, { source: 'amazon' }).filter(
      (c) => c.purchaseId === orderId
    );
    if (charge === undefined) throw new Error('expected a solvable charge');

    persistProposedLinks(opened.db, [
      {
        chargeId: charge.id,
        transactionUri: 'pops://finance/transaction/rejected',
        transactionDescription: 'AMAZON',
        amountCents: 5678,
        linkType: 'exact',
        confidence: 1,
      },
    ]);
    rejectLink(opened.db, charge.id, 'pops://finance/transaction/rejected', '2026-04-02T00:00:00Z');

    expect(listRejectedPairings(opened.db, [charge.id])).toEqual([
      { chargeId: charge.id, transactionUri: 'pops://finance/transaction/rejected' },
    ]);
    expect(listRejectedPairings(opened.db, ['some-other-charge-id'])).toEqual([]);

    temp.cleanup();
  });
});
