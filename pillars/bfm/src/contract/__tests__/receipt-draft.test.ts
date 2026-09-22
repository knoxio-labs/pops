/**
 * The adjustment-basis fields on bfm's mobile draft/manual/extract schemas
 * (POPS-3651). `MobileDraftPurchaseFieldsSchema` backs both
 * `MobileSaveReceiptDraftBodySchema` and `MobileCreateManualPurchaseBodySchema`
 * via `.extend`, so one round trip on the save body exercises both routes.
 */
import { describe, expect, it } from 'vitest';

import {
  MobileDraftLineSchema,
  MobileReceiptDraftSchema,
  MobileSaveReceiptDraftBodySchema,
} from '../receipt-draft.js';

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
  merchantAddressName: null,
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

const MINIMAL_LINE = { name: 'A', unitPriceCents: 350, lineTotalCents: 350, notes: [] };

describe('MobileDraftLineSchema — list price', () => {
  it('round-trips a stated list price and its assertion', () => {
    const parsed = MobileDraftLineSchema.parse({
      ...MINIMAL_LINE,
      listPriceCents: 550,
      listPriceAsserted: true,
    });
    expect(parsed.listPriceCents).toBe(550);
    expect(parsed.listPriceAsserted).toBe(true);
  });

  it('parses with both fields omitted, backward compatible with a line that predates them', () => {
    const parsed = MobileDraftLineSchema.parse(MINIMAL_LINE);
    expect(parsed.listPriceCents).toBeUndefined();
    expect(parsed.listPriceAsserted).toBeUndefined();
  });
});

describe('MobileSaveReceiptDraftBodySchema — merchant and address (ADR-053, POPS-4326)', () => {
  it('round-trips a resolved merchant and address', () => {
    const parsed = MobileSaveReceiptDraftBodySchema.parse({
      ...MINIMAL_SAVE_BODY,
      merchantEntityId: 'entity-1',
      merchantAddressId: 'addr-1',
      merchantAddressName: '12 Example St, Sydney',
    });
    expect(parsed.merchantEntityId).toBe('entity-1');
    expect(parsed.merchantAddressId).toBe('addr-1');
    expect(parsed.merchantAddressName).toBe('12 Example St, Sydney');
  });

  it('parses with all three omitted, the free-text-only fallback path', () => {
    const parsed = MobileSaveReceiptDraftBodySchema.parse(MINIMAL_SAVE_BODY);
    expect(parsed.merchantEntityId).toBeUndefined();
    expect(parsed.merchantAddressId).toBeUndefined();
    expect(parsed.merchantAddressName).toBeUndefined();
  });
});

describe('MobileReceiptDraftSchema — the extracted address (ADR-053)', () => {
  it('carries a printed address', () => {
    const parsed = MobileReceiptDraftSchema.parse({
      ...MINIMAL_DRAFT,
      taxIncluded: null,
      discountIncluded: null,
      surchargeIncluded: null,
      shippingIncluded: null,
      merchantAddressName: '12 Example St, Sydney',
    });
    expect(parsed.merchantAddressName).toBe('12 Example St, Sydney');
  });

  it('rejects an omitted merchantAddressName — a definite null is required', () => {
    const { merchantAddressName: _omit, ...withoutAddress } = MINIMAL_DRAFT;
    expect(() =>
      MobileReceiptDraftSchema.parse({
        ...withoutAddress,
        taxIncluded: null,
        discountIncluded: null,
        surchargeIncluded: null,
        shippingIncluded: null,
      })
    ).toThrow();
  });
});
