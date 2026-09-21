/**
 * The adjustment-basis fields on bfm's mobile draft/manual/extract schemas
 * (POPS-3651). `MobileDraftPurchaseFieldsSchema` backs both
 * `MobileSaveReceiptDraftBodySchema` and `MobileCreateManualPurchaseBodySchema`
 * via `.extend`, so one round trip on the save body exercises both routes.
 */
import { describe, expect, it } from 'vitest';

import { MobileReceiptDraftSchema, MobileSaveReceiptDraftBodySchema } from '../receipt-draft.js';

const MINIMAL_SAVE_BODY = {
  merchantName: 'Bunnings',
  orderedAt: '2026-02-02T01:41:21.000Z',
  currency: 'AUD',
  totalCents: 2750,
  items: [{ name: 'A', quantity: null, unitPriceCents: 2750, lineTotalCents: 2750, notes: [] }],
  documents: [{ documentUri: 'pops://documents/document/x', kind: 'receipt' }],
  idempotencyKey: 'k',
};

const MINIMAL_DRAFT = {
  merchantName: 'Bunnings',
  orderedAt: '2026-02-02T01:41:21.000Z',
  orderedAtOffsetMinutes: null,
  currency: 'AUD',
  totalCents: 2750,
  subtotalCents: 2750,
  taxCents: 0,
  surchargeCents: 0,
  shippingCents: 0,
  discountCents: 0,
  items: [],
  documents: [],
  capture: null,
};

describe('MobileSaveReceiptDraftBodySchema — adjustment basis', () => {
  it('round-trips a stated basis for all four flags', () => {
    const parsed = MobileSaveReceiptDraftBodySchema.parse({
      ...MINIMAL_SAVE_BODY,
      taxIncluded: true,
      discountIncluded: false,
      surchargeIncluded: true,
      shippingIncluded: true,
    });

    expect(parsed.taxIncluded).toBe(true);
    expect(parsed.discountIncluded).toBe(false);
    expect(parsed.surchargeIncluded).toBe(true);
    expect(parsed.shippingIncluded).toBe(true);
  });

  it('parses with every basis flag omitted', () => {
    const parsed = MobileSaveReceiptDraftBodySchema.parse(MINIMAL_SAVE_BODY);

    expect(parsed.taxIncluded).toBeUndefined();
    expect(parsed.discountIncluded).toBeUndefined();
    expect(parsed.surchargeIncluded).toBeUndefined();
    expect(parsed.shippingIncluded).toBeUndefined();
  });
});

describe('MobileReceiptDraftSchema — adjustment basis', () => {
  it('round-trips a stated basis for all four flags', () => {
    const parsed = MobileReceiptDraftSchema.parse({
      ...MINIMAL_DRAFT,
      taxIncluded: true,
      discountIncluded: false,
      surchargeIncluded: false,
      shippingIncluded: true,
    });

    expect(parsed.taxIncluded).toBe(true);
    expect(parsed.shippingIncluded).toBe(true);
  });

  it('requires a definite verdict — null, not omitted', () => {
    const parsed = MobileReceiptDraftSchema.parse({
      ...MINIMAL_DRAFT,
      taxIncluded: null,
      discountIncluded: null,
      surchargeIncluded: null,
      shippingIncluded: null,
    });

    expect(parsed.taxIncluded).toBeNull();
    expect(parsed.shippingIncluded).toBeNull();
    expect(() => MobileReceiptDraftSchema.parse(MINIMAL_DRAFT)).toThrow();
  });
});
