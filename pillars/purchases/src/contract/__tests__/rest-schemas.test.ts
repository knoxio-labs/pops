/**
 * `CreatePurchaseBodySchema`'s adjustment-basis fields (POPS-3651). A round
 * trip at the schema level, rather than through HTTP, so a field dropped
 * from one of the three places it needs to exist (the write schema, the
 * read schema, `CreatePurchaseInput`) is visible without a route to
 * exercise it.
 */
import { describe, expect, it } from 'vitest';

import { CreatePurchaseBodySchema } from '../rest-schemas.js';

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
