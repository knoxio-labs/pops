/**
 * The assembled order document, and the accounting split that travels with
 * it.
 *
 * Separate from `purchase.ts` because the shapes there are rows — one
 * table's wire form each — while these four are the composition: what
 * `GET /purchases/:id` returns once every list hanging off an order has
 * been gathered. The dependency runs one way, composition onto rows, and
 * keeping it in one file was what put that file over its line budget.
 */
import { z } from 'zod';

import {
  CentsSchema,
  NonNegativeCentsSchema,
  PurchaseChargeLinkSchema,
  PurchaseChargeSchema,
  PurchaseDocumentSchema,
  PurchaseItemAllocationSchema,
  PurchaseItemSchema,
  PurchaseItemTagSchema,
  PurchaseItemUnitSchema,
  PurchaseSchema,
  PurchaseShipmentSchema,
} from './purchase.js';

/**
 * The accounting split.
 *
 * Part of the wire format on purpose, and pre-split so no consumer has to
 * derive it. A view that drops the residual converts a known unknown into a
 * false certainty, which ADR-042 rates as worse than showing nothing; one
 * that folds `awaitingImportCents` into it flags every recent order as
 * broken until its statement imports; and one that folds refunds in reports
 * returned money as missing money.
 *
 * The identity consumers can rely on:
 * `totalCents === matchedCents + awaitingImportCents + residualCents`,
 * with `refundedCents` orthogonal and `netSpendCents` the headline figure,
 * `totalCents − refundedCents`. That last one answers what the order cost,
 * not how much of it has been proven — "money we can prove moved, net of
 * refunds" stays derivable as `matched + awaitingImport − refunded`.
 */
export const PurchaseAccountingSchema = z.object({
  totalCents: CentsSchema,
  matchedCents: CentsSchema,
  awaitingImportCents: CentsSchema,
  residualCents: CentsSchema,
  /** Positive magnitude, so `refundedCents: 1179` reads as "$11.79 came back". */
  refundedCents: NonNegativeCentsSchema,
  /** Signed and unclamped: negative is a genuine over-refund, not an artefact. */
  netSpendCents: CentsSchema,
});

export const PurchaseItemDetailSchema = z.object({
  item: PurchaseItemSchema,
  /** POPS classification, each carrying whether it is asserted or proposed. */
  tags: z.array(PurchaseItemTagSchema),
  /** Verbatim merchant prose, in the order it was printed. */
  notes: z.array(z.string()),
  units: z.array(PurchaseItemUnitSchema),
  landedCostCents: CentsSchema,
});

export const PurchaseChargeDetailSchema = z.object({
  charge: PurchaseChargeSchema,
  links: z.array(PurchaseChargeLinkSchema),
  allocations: z.array(PurchaseItemAllocationSchema),
});

/** An order and every list hanging off it. */
export const PurchaseDetailSchema = z.object({
  /**
   * Facts about the order that are not fields — `date-uncertain` when the
   * receipt stated no date, `timezone-uncertain` when the shop's zone had
   * to be guessed. A reviewer needs these to know which figures the source
   * actually stated.
   */
  tags: z.array(z.string()),
  purchase: PurchaseSchema,
  shipments: z.array(PurchaseShipmentSchema),
  items: z.array(PurchaseItemDetailSchema),
  charges: z.array(PurchaseChargeDetailSchema),
  documents: z.array(PurchaseDocumentSchema),
  accounting: PurchaseAccountingSchema,
});
