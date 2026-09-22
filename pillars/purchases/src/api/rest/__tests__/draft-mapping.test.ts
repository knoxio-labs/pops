/**
 * `findDraftInconsistency`'s basis-aware arithmetic (POPS-3651).
 *
 * The extraction-time gate (`gate.ts`) runs before the reviewer sees
 * anything; this check runs again at SAVE time against whatever the
 * reviewer ends up submitting. Before this change it always assumed none
 * of tax/discount/surcharge/shipping were included, regardless of what the
 * phone sent — so a reviewer confirming a GST-inclusive receipt would see
 * a false inconsistency the moment they agreed with what the reading
 * already said.
 */
import { describe, expect, it } from 'vitest';

import { findDraftInconsistency } from '../draft-mapping.js';

import type { z } from 'zod';

import type { CreateManualPurchaseBodySchema } from '../../../contract/rest-schemas.js';
import type { DraftBody } from '../draft-mapping.js';

type ManualBody = z.infer<typeof CreateManualPurchaseBodySchema>;

const draft = (over: Partial<ManualBody> = {}): DraftBody => ({
  orderedAt: '2026-02-02T01:41:21.000Z',
  currency: 'AUD',
  totalCents: 2750,
  idempotencyKey: 'k',
  items: [{ name: 'A', unitPriceCents: 2750, lineTotalCents: 2750 }],
  ...over,
});

describe('findDraftInconsistency — adjustment basis', () => {
  it('agrees when tax sits on top of the lines and is not marked included', () => {
    const body = draft({ totalCents: 3025, taxCents: 275 });

    expect(findDraftInconsistency(body)).toBeNull();
  });

  it('agrees when tax is already inside the lines and marked included', () => {
    // Without the fix, taxCents would be added a second time and this
    // would report a mismatch even though the lines and total agree.
    const body = draft({ totalCents: 2750, taxCents: 250, taxIncluded: true });

    expect(findDraftInconsistency(body)).toBeNull();
  });

  it('agrees when a discount is already folded into the lines', () => {
    const body = draft({ totalCents: 2750, discountCents: 500, discountIncluded: true });

    expect(findDraftInconsistency(body)).toBeNull();
  });

  it('agrees when shipping is already folded into the lines', () => {
    // Shipping was previously always added regardless of any flag.
    const body = draft({ totalCents: 2750, shippingCents: 995, shippingIncluded: true });

    expect(findDraftInconsistency(body)).toBeNull();
  });

  it('reports a mismatch when the asserted basis is wrong', () => {
    // Tax is really already inside the lines, but the reviewer says it is
    // not, so the check adds it a second time and finds a mismatch.
    const body = draft({ totalCents: 2750, taxCents: 250, taxIncluded: false });

    const result = findDraftInconsistency(body);

    expect(result).not.toBeNull();
    expect(result?.message).toContain('does not match');
  });
});
