/**
 * `mintDerivedCharge`'s position assignment.
 *
 * POPS-1775: every minted charge landed at `position: 0`, which ties with
 * an existing charge at the same position — a refund ingested as an
 * order's only stated charge, in particular — and the read path's tiebreak
 * (`ORDER BY position ASC, id ASC`) falls through to a random UUID. These
 * tests pin the ordering down: a mint must land at a position strictly
 * after everything already on the order, and that has to hold regardless
 * of how the ids involved happen to sort.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPurchase, getPurchase, mintDerivedCharge } from '../index.js';
import { amazonOrder, openTempDb, seedAmazonSource, type TempDb } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

describe('mintDerivedCharge position', () => {
  let temp: TempDb;
  let opened: OpenedPurchasesDb;

  beforeEach(() => {
    temp = openTempDb();
    opened = temp.opened;
    seedAmazonSource(opened);
  });

  afterEach(() => {
    temp.cleanup();
    vi.restoreAllMocks();
  });

  it('gives a minted capture a distinct, higher position than an existing charge', () => {
    const orderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:refund-only',
        sourceOrderId: 'amazon-refund-only',
        totalCents: 1000,
        charges: [{ amountCents: -1000, role: 'refund', sourceChargeRef: 'refund-1' }],
      })
    );

    const mintedId = mintDerivedCharge(opened.db, {
      id: orderId,
      totalCents: 1000,
      currency: 'AUD',
    });

    const detail = getPurchase(opened.db, orderId);
    if (detail === undefined) throw new Error('purchase not found');
    const refund = detail.charges.find((c) => c.charge.id !== mintedId);
    const minted = detail.charges.find((c) => c.charge.id === mintedId);
    if (refund === undefined || minted === undefined) throw new Error('expected two charges');

    expect(minted.charge.position).toBeGreaterThan(refund.charge.position);
  });

  it('gives two successive mints on the same purchase distinct, increasing positions', () => {
    const orderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:no-charges',
        sourceOrderId: 'amazon-no-charges',
        totalCents: 2000,
      })
    );

    const firstId = mintDerivedCharge(opened.db, {
      id: orderId,
      totalCents: 2000,
      currency: 'AUD',
    });
    const secondId = mintDerivedCharge(opened.db, {
      id: orderId,
      totalCents: 2000,
      currency: 'AUD',
    });

    const detail = getPurchase(opened.db, orderId);
    if (detail === undefined) throw new Error('purchase not found');
    const first = detail.charges.find((c) => c.charge.id === firstId);
    const second = detail.charges.find((c) => c.charge.id === secondId);
    if (first === undefined || second === undefined) throw new Error('expected two minted charges');

    expect(second.charge.position).toBeGreaterThan(first.charge.position);
  });

  it('orders a refund before a minted capture even when the minted id sorts first', () => {
    const orderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:id-disagreement',
        sourceOrderId: 'amazon-id-disagreement',
        totalCents: 1500,
        charges: [{ amountCents: -1500, role: 'refund', sourceChargeRef: 'refund-1' }],
      })
    );

    const before = getPurchase(opened.db, orderId);
    if (before === undefined) throw new Error('purchase not found');
    const refundId = before.charges[0]?.charge.id;
    if (refundId === undefined) throw new Error('expected a seeded refund charge');

    // Force the minted charge's id to sort before the refund's, so a
    // tiebreak that fell through to `id ASC` would render it first. The
    // fix must keep the refund first on `position` alone.
    const forcedId = '00000000-0000-4000-8000-000000000000';
    expect(forcedId < refundId).toBe(true);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValueOnce(
      forcedId as `${string}-${string}-${string}-${string}-${string}`
    );

    const mintedId = mintDerivedCharge(opened.db, {
      id: orderId,
      totalCents: 1500,
      currency: 'AUD',
    });
    expect(mintedId).toBe(forcedId);

    const detail = getPurchase(opened.db, orderId);
    if (detail === undefined) throw new Error('purchase not found');
    expect(detail.charges.map((c) => c.charge.id)).toEqual([refundId, mintedId]);
  });

  it('reads an order back in the same order across repeated reads and re-seeded UUIDs', () => {
    function buildAndRead(mintedUuid: `${string}-${string}-${string}-${string}-${string}`): {
      refundId: string;
      mintedId: string;
      order: readonly string[];
    } {
      const local = openTempDb();
      seedAmazonSource(local.opened);
      try {
        const orderId = createPurchase(
          local.opened.db,
          amazonOrder({
            checksum: 'amazon:repeatable',
            sourceOrderId: 'amazon-repeatable',
            totalCents: 800,
            charges: [{ amountCents: -800, role: 'refund', sourceChargeRef: 'refund-1' }],
          })
        );
        const refundId = getPurchase(local.opened.db, orderId)?.charges[0]?.charge.id;
        if (refundId === undefined) throw new Error('expected a seeded refund charge');

        vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValueOnce(mintedUuid);
        const mintedId = mintDerivedCharge(local.opened.db, {
          id: orderId,
          totalCents: 800,
          currency: 'AUD',
        });

        const firstRead = getPurchase(local.opened.db, orderId)?.charges.map((c) => c.charge.id);
        const secondRead = getPurchase(local.opened.db, orderId)?.charges.map((c) => c.charge.id);
        expect(firstRead).toEqual(secondRead);
        return { refundId, mintedId, order: firstRead ?? [] };
      } finally {
        local.cleanup();
        vi.restoreAllMocks();
      }
    }

    // Two independent databases, seeded with UUIDs that sort in opposite
    // directions relative to the refund's id. Both must place the refund
    // (position 0) before the derived capture (position 1) — the order
    // must come from `position`, never from which run happened to mint a
    // smaller or larger id.
    const low = buildAndRead('00000000-0000-4000-8000-000000000000');
    const high = buildAndRead('ffffffff-ffff-4fff-8fff-ffffffffffff');

    expect(low.order).toEqual([low.refundId, low.mintedId]);
    expect(high.order).toEqual([high.refundId, high.mintedId]);
  });

  it('leaves ordering of non-minted, merchant-stated charges unchanged', () => {
    const orderId = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'amazon:two-merchant-charges',
        sourceOrderId: 'amazon-two-merchant-charges',
        totalCents: 3000,
        charges: [
          { amountCents: 3000, role: 'capture', sourceChargeRef: 'chg-1' },
          { amountCents: -500, role: 'refund', sourceChargeRef: 'chg-2' },
        ],
      })
    );

    const detail = getPurchase(opened.db, orderId);
    if (detail === undefined) throw new Error('purchase not found');
    expect(detail.charges.map((c) => c.charge.position)).toEqual([0, 1]);
    expect(detail.charges.map((c) => c.charge.role)).toEqual(['capture', 'refund']);
  });
});
