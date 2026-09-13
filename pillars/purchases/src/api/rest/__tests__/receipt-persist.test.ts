/**
 * Recognising one shop photographed twice.
 *
 * The content-addressed key catches the same bytes sent twice. This is the
 * other case, and the common one: the same paper photographed again, or
 * photographed and then uploaded as the merchant's own PDF. Different
 * bytes, one purchase.
 *
 * The guard that matters is the date one. A receipt whose date nobody could
 * read is dated from the upload, and two uploads of the same paper happen
 * at different moments — so asking would never match, and worse, two
 * genuinely different undated receipts uploaded in the same second would.
 */
import { describe, expect, it } from 'vitest';

import { openTempDb } from '../../../db/__tests__/helpers.js';
import { DATE_UNCERTAIN, RECEIPT_SOURCE_ID } from '../../../ingest/receipt/purchase.js';
import { persistReceiptPurchase, sameShopAlreadyRecorded } from '../receipt-persist.js';

import type { CreatePurchaseInput } from '../../../db/services/purchase-input.js';

const INSTANT = '2026-08-01T04:32:00.000Z';

const receiptPurchase = (over: Partial<CreatePurchaseInput> = {}): CreatePurchaseInput => ({
  source: RECEIPT_SOURCE_ID,
  ingestMethod: 'upload',
  orderedAt: INSTANT,
  currency: 'AUD',
  totalCents: 2750,
  checksum: 'bytes-of-the-first-photograph',
  charges: [{ sourceChargeRef: 'c1', amountCents: 2750, role: 'capture' }],
  ...over,
});

describe('sameShopAlreadyRecorded', () => {
  it('recognises a second photograph of a receipt already recorded', () => {
    const { opened, cleanup } = openTempDb();
    try {
      const written = persistReceiptPurchase(opened.db, receiptPurchase());
      expect(written.kind).toBe('written');

      // Different bytes, same paper: the second file hashes differently, so
      // only the stated instant and amount can tell they are one shop.
      const found = sameShopAlreadyRecorded(
        opened.db,
        receiptPurchase({ checksum: 'bytes-of-the-second-photograph' })
      );

      expect(found).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it('never asks when the date was inferred rather than read', () => {
    const { opened, cleanup } = openTempDb();
    try {
      persistReceiptPurchase(opened.db, receiptPurchase({ tags: [DATE_UNCERTAIN] }));

      // Same instant and same amount as the row above — and still not a
      // match, because neither date came off the paper. Two undated
      // receipts uploaded in the same second are two receipts.
      const found = sameShopAlreadyRecorded(
        opened.db,
        receiptPurchase({ checksum: 'another-file', tags: [DATE_UNCERTAIN] })
      );

      expect(found).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('does not match a different amount at the same instant', () => {
    const { opened, cleanup } = openTempDb();
    try {
      persistReceiptPurchase(opened.db, receiptPurchase());

      const found = sameShopAlreadyRecorded(
        opened.db,
        receiptPurchase({ checksum: 'other', totalCents: 2751 })
      );

      expect(found).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

describe('persistReceiptPurchase', () => {
  it('refuses the same bytes twice as a conflict', () => {
    const { opened, cleanup } = openTempDb();
    try {
      expect(persistReceiptPurchase(opened.db, receiptPurchase()).kind).toBe('written');

      const again = persistReceiptPurchase(opened.db, receiptPurchase({ charges: [] }));

      expect(again.kind).toBe('refused');
      if (again.kind !== 'refused') return;
      expect(again.status).toBe(409);
    } finally {
      cleanup();
    }
  });
});
