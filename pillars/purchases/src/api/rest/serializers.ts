import type { z } from 'zod';

/**
 * Row → wire projection for the order detail envelope.
 *
 * Rows already match the contract's field names one-for-one — tags moved
 * out to their own table precisely so no row needs a JSON round-trip — so
 * this is a shape assembler rather than a converter. It exists to give the
 * handler one call instead of four nested `.map`s, and to widen the
 * service layer's `readonly` arrays into the mutable ones ts-rest's
 * response types expect.
 *
 * The return type is the contract's own inferred type, so a field added to
 * `PurchaseDetailSchema` without a matching row fails here rather than at
 * runtime.
 */
import type { PurchaseDetailSchema } from '../../contract/schemas/purchase.js';
import type { PurchaseDetail } from '../../db/index.js';

export type PurchaseDetailBody = z.infer<typeof PurchaseDetailSchema>;

export function toPurchaseDetailBody(detail: PurchaseDetail): PurchaseDetailBody {
  return {
    purchase: detail.purchase,
    shipments: [...detail.shipments],
    items: detail.items.map((entry) => ({
      item: entry.item,
      tags: [...entry.tags],
      units: [...entry.units],
      landedCostCents: entry.landedCostCents,
    })),
    charges: detail.charges.map((entry) => ({
      charge: entry.charge,
      links: [...entry.links],
      allocations: [...entry.allocations],
    })),
    documents: [...detail.documents],
    accounting: detail.accounting,
  };
}
