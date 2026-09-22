/**
 * `CreatePurchaseBodySchema`'s adjustment-basis fields (POPS-3651). A round
 * trip at the schema level, rather than through HTTP, so a field dropped
 * from one of the three places it needs to exist (the write schema, the
 * read schema, `CreatePurchaseInput`) is visible without a route to
 * exercise it.
 */
import { describe, expect, it } from 'vitest';

import { CreateItemBodySchema, CreatePurchaseBodySchema } from '../rest-schemas.js';

const MINIMAL = {
  source: 'amazon',
  ingestMethod: 'export' as const,
  orderedAt: '2026-02-02T01:41:21.000Z',
  currency: 'AUD',
  totalCents: 100,
  checksum: 'x',
};

describe('CreatePurchaseBodySchema — adjustment basis', () => {
  it('round-trips a stated basis for every one of the four flags', () => {
    const parsed = CreatePurchaseBodySchema.parse({
      ...MINIMAL,
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

  it('parses with every basis flag omitted, for a caller that never learned to state one', () => {
    const parsed = CreatePurchaseBodySchema.parse(MINIMAL);

    expect(parsed.taxIncluded).toBeUndefined();
    expect(parsed.discountIncluded).toBeUndefined();
    expect(parsed.surchargeIncluded).toBeUndefined();
    expect(parsed.shippingIncluded).toBeUndefined();
  });
});

describe('CreatePurchaseBodySchema — merchant address (ADR-053)', () => {
  it('accepts merchantAddressId and merchantAddressName', () => {
    const parsed = CreatePurchaseBodySchema.parse({
      ...MINIMAL,
      merchantAddressId: 'addr-1',
      merchantAddressName: '12 Example St, Sydney',
    });

    expect(parsed.merchantAddressId).toBe('addr-1');
    expect(parsed.merchantAddressName).toBe('12 Example St, Sydney');
  });

  it('accepts an explicit null for either field', () => {
    const parsed = CreatePurchaseBodySchema.parse({
      ...MINIMAL,
      merchantAddressId: null,
      merchantAddressName: null,
    });

    expect(parsed.merchantAddressId).toBeNull();
    expect(parsed.merchantAddressName).toBeNull();
  });

  it('parses with both omitted', () => {
    const parsed = CreatePurchaseBodySchema.parse(MINIMAL);

    expect(parsed.merchantAddressId).toBeUndefined();
    expect(parsed.merchantAddressName).toBeUndefined();
  });

  it('rejects a non-string, non-null merchantAddressId', () => {
    expect(() =>
      CreatePurchaseBodySchema.parse({
        ...MINIMAL,
        merchantAddressId: 42,
      })
    ).toThrow();
  });

  it('rejects a non-string, non-null merchantAddressName', () => {
    expect(() =>
      CreatePurchaseBodySchema.parse({
        ...MINIMAL,
        merchantAddressName: 42,
      })
    ).toThrow();
  });
});

const MINIMAL_ITEM = {
  name: 'Timber Pine DAR 42x19',
  unitPriceCents: 350,
  lineTotalCents: 350,
};

describe('CreateItemBodySchema — list price (POPS-3652)', () => {
  it('round-trips a stated list price and its assertion', () => {
    const parsed = CreateItemBodySchema.parse({
      ...MINIMAL_ITEM,
      listPriceCents: 550,
      listPriceAsserted: true,
    });

    expect(parsed.listPriceCents).toBe(550);
    expect(parsed.listPriceAsserted).toBe(true);
  });

  it('parses with both fields omitted, backward compatible with every existing adapter payload', () => {
    const parsed = CreateItemBodySchema.parse(MINIMAL_ITEM);

    expect(parsed.listPriceCents).toBeUndefined();
    expect(parsed.listPriceAsserted).toBeUndefined();
  });
});
