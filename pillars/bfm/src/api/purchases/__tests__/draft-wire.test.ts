/**
 * `toMobileExtractOutcome`'s adjustment-basis mapping (POPS-3651). Guards
 * against a producer-side rename reaching the phone as a silently-dropped
 * field, which is this file's own stated purpose for every field it maps.
 */
import { describe, expect, it } from 'vitest';

import { toMobileExtractOutcome } from '../draft-wire.js';

import type { PurchasesExtractOutcome } from '../draft-wire.js';

const BASE_DRAFT = {
  merchantEntityName: 'Bunnings',
  orderedAt: '2026-02-02T01:41:21.000Z',
  currency: 'AUD',
  totalCents: 2750,
  items: [],
};

const outcome = (draftOver: Record<string, unknown> = {}): PurchasesExtractOutcome => ({
  kind: 'draft',
  receiptUris: ['pops://receipts/x'],
  reconciled: true,
  failures: [],
  matchedMerchantEntityId: null,
  draft: { ...BASE_DRAFT, ...draftOver },
});

describe('toMobileExtractOutcome — adjustment basis', () => {
  it('forwards a stated basis for all four flags', () => {
    const mapped = toMobileExtractOutcome(
      outcome({
        taxIncluded: true,
        discountIncluded: false,
        surchargeIncluded: false,
        shippingIncluded: true,
      })
    );

    if (mapped.kind !== 'draft') throw new Error('expected a draft outcome');
    expect(mapped.draft.taxIncluded).toBe(true);
    expect(mapped.draft.discountIncluded).toBe(false);
    expect(mapped.draft.surchargeIncluded).toBe(false);
    expect(mapped.draft.shippingIncluded).toBe(true);
  });

  it('maps an omitted basis to null rather than a fabricated default', () => {
    const mapped = toMobileExtractOutcome(outcome());

    if (mapped.kind !== 'draft') throw new Error('expected a draft outcome');
    expect(mapped.draft.taxIncluded).toBeNull();
    expect(mapped.draft.discountIncluded).toBeNull();
    expect(mapped.draft.surchargeIncluded).toBeNull();
    expect(mapped.draft.shippingIncluded).toBeNull();
  });
});

describe('toMobileExtractOutcome — list price', () => {
  it('forwards a stated list price per line', () => {
    const mapped = toMobileExtractOutcome(
      outcome({
        items: [{ name: 'A', unitPriceCents: 350, lineTotalCents: 350, listPriceCents: 550 }],
      })
    );

    if (mapped.kind !== 'draft') throw new Error('expected a draft outcome');
    expect(mapped.draft.items[0]?.listPriceCents).toBe(550);
  });

  it('maps an absent list price to null', () => {
    const mapped = toMobileExtractOutcome(
      outcome({ items: [{ name: 'A', unitPriceCents: 350, lineTotalCents: 350 }] })
    );

    if (mapped.kind !== 'draft') throw new Error('expected a draft outcome');
    expect(mapped.draft.items[0]?.listPriceCents).toBeNull();
  });
});

describe('toMobileExtractOutcome — the branch address (ADR-053)', () => {
  it('forwards a stated merchantAddressName', () => {
    const mapped = toMobileExtractOutcome(
      outcome({ merchantAddressName: '12 Example St, Sydney' })
    );

    if (mapped.kind !== 'draft') throw new Error('expected a draft outcome');
    expect(mapped.draft.merchantAddressName).toBe('12 Example St, Sydney');
  });

  it('maps an absent merchantAddressName to null', () => {
    const mapped = toMobileExtractOutcome(outcome());

    if (mapped.kind !== 'draft') throw new Error('expected a draft outcome');
    expect(mapped.draft.merchantAddressName).toBeNull();
  });
});
