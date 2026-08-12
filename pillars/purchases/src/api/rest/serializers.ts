import type { z } from 'zod';

/**
 * Row → wire projection for the order detail envelope.
 *
 * Mostly a shape assembler: rows match the contract's field names
 * one-for-one — tags moved out to their own table precisely so no row needs
 * a JSON round-trip — so this exists to give the handler one call instead of
 * four nested `.map`s, and to widen the service layer's `readonly` arrays
 * into the mutable ones ts-rest's response types expect.
 *
 * The one real conversion is {@link toPurchaseItemBody}, and it is the
 * reason this file matters. A line's `kind` is stored flat, as a value and
 * a confirmation timestamp in two columns; on the wire it is one object, so
 * a consumer cannot reach the value without being handed the marker that
 * says whether to believe it. This is the only place that projection
 * happens, which is what makes it hold.
 *
 * The return type is the contract's own inferred type, so a field added to
 * `PurchaseDetailSchema` without a matching row fails here rather than at
 * runtime.
 */
import type {
  PurchaseItemDetailSchema,
  PurchaseItemSchema,
  PurchaseDetailSchema,
} from '../../contract/schemas/purchase.js';
import type { PurchaseDetail, PurchaseItemDetail, PurchaseItemRow } from '../../db/index.js';

export type PurchaseDetailBody = z.infer<typeof PurchaseDetailSchema>;
export type PurchaseItemBody = z.infer<typeof PurchaseItemSchema>;
export type PurchaseItemDetailBody = z.infer<typeof PurchaseItemDetailSchema>;

/**
 * A line, with its classification and that classification's provenance
 * fused into one value.
 *
 * `kind: null` means unclassified. Anything else carries `confirmedAt`,
 * which is null while a proposal pass owns the value and set once it has
 * been asserted. There is deliberately no way to serialise one without the
 * other.
 */
export function toPurchaseItemBody(item: PurchaseItemRow): PurchaseItemBody {
  const { kind, kindConfirmedAt, ...rest } = item;
  return { ...rest, kind: kind === null ? null : { value: kind, confirmedAt: kindConfirmedAt } };
}

export function toPurchaseItemDetailBody(entry: PurchaseItemDetail): PurchaseItemDetailBody {
  return {
    item: toPurchaseItemBody(entry.item),
    tags: entry.tags.map((tag) => ({ tag: tag.tag, confirmedAt: tag.confirmedAt })),
    notes: [...entry.notes],
    units: [...entry.units],
    landedCostCents: entry.landedCostCents,
  };
}

export function toPurchaseDetailBody(detail: PurchaseDetail): PurchaseDetailBody {
  return {
    tags: [...detail.tags],
    purchase: detail.purchase,
    shipments: [...detail.shipments],
    items: detail.items.map(toPurchaseItemDetailBody),
    charges: detail.charges.map((entry) => ({
      charge: entry.charge,
      links: [...entry.links],
      allocations: [...entry.allocations],
    })),
    documents: [...detail.documents],
    accounting: detail.accounting,
  };
}
