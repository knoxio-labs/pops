/**
 * Order CRUD — `purchase.*` sub-router.
 *
 * Read and write only. Nothing here links, matches, or sweeps: the
 * reconciliation surface arrives with the matching engine.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { InventoryProposalDecisionSchema, InventoryProposalSchema } from './inventory-proposals.js';
import {
  AttachDocumentBodySchema,
  CreatePurchaseBodySchema,
  ErrorBodySchema,
  ListItemsByTagQuerySchema,
  ListPurchasesQuerySchema,
  OkSchema,
  PatchItemBodySchema,
} from './rest-schemas.js';
import { PurchaseDetailSchema, PurchaseItemDetailSchema } from './schemas/purchase-detail.js';
import {
  IsoTimestampSchema,
  PurchaseDocumentSchema,
  PurchaseItemSchema,
  PurchaseItemUnitSchema,
  PurchaseSchema,
} from './schemas/purchase.js';

const c = initContract();

/**
 * A line that carries the requested tag, with the tag's own confirmation
 * marker beside it.
 *
 * The marker travels because the item alone cannot carry it — the tag is on
 * the join row, not the line — and a list of lines "tagged `snack`" that
 * silently mixes proposals with decisions is exactly the counterfactual a
 * consumer must not compute.
 */
const TaggedItemSchema = z.object({
  item: PurchaseItemSchema,
  confirmedAt: IsoTimestampSchema.nullable(),
});

export const purchasesPurchaseContract = c.router({
  list: {
    method: 'GET',
    path: '/purchases',
    query: ListPurchasesQuerySchema,
    responses: {
      200: z.object({ items: z.array(PurchaseSchema) }),
      // Two merchant parameters at once. Declared, because the alternative a
      // caller cannot detect is a 200 computed from whichever one won.
      400: ErrorBodySchema,
    },
    summary: 'List orders, newest first',
  },
  get: {
    method: 'GET',
    path: '/purchases/:id',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: PurchaseDetailSchema,
      404: ErrorBodySchema,
    },
    summary: 'Get an order with its deliveries, lines, charges, documents and accounting split',
  },
  create: {
    method: 'POST',
    path: '/purchases',
    body: CreatePurchaseBodySchema,
    responses: {
      201: PurchaseDetailSchema,
      400: ErrorBodySchema,
      // A checksum that already exists. Adapters treat this as a skip, not
      // a failure — re-ingesting the same export bundle is expected.
      409: ErrorBodySchema,
    },
    summary: 'Create an order with its deliveries, lines, charges and documents',
  },
  /**
   * Attach one document to an order that already exists.
   *
   * Evidence does not always arrive with the order it belongs to. A DSAR
   * bundle's tax invoices sit in a different folder than its order history,
   * and the history is what gets ingested first — so by the time the invoices
   * are read, {@link create} refuses every one of those orders at the
   * checksum and the evidence has nowhere to go.
   *
   * A repeat is the 409, not a second row: `uq_purchase_documents` holds the
   * order-and-URI pair unique, which is what lets a backfill be re-run.
   *
   * ADR-042 and the documents pillar will take this surface over, so it is
   * deliberately one document at a time and carries no shipment.
   */
  attachDocument: {
    method: 'POST',
    path: '/purchases/:id/documents',
    pathParams: z.object({ id: z.string() }),
    body: AttachDocumentBodySchema,
    responses: {
      201: z.object({ document: PurchaseDocumentSchema }),
      404: ErrorBodySchema,
      // The order already carries that URI. A re-run treats this as a skip.
      409: ErrorBodySchema,
    },
    summary: 'Attach a document to an existing order',
  },
  delete: {
    method: 'DELETE',
    path: '/purchases/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Hard-delete an order (everything hanging off it cascades)',
  },
  /**
   * The pillar's first item-level mutation, and the only way an item tag or
   * a confirmed kind is ever written.
   *
   * Scoped under the order rather than a bare `/items/:itemId` so a line
   * cannot be addressed without its order — the id is a random UUID and a
   * caller that has one but not the other is guessing.
   */
  patchItem: {
    method: 'PATCH',
    path: '/purchases/:id/items/:itemId',
    pathParams: z.object({ id: z.string(), itemId: z.string() }),
    body: PatchItemBodySchema,
    responses: {
      200: PurchaseItemDetailSchema,
      400: ErrorBodySchema,
      404: ErrorBodySchema,
    },
    summary: "Confirm a line's kind and item tags",
  },
  /**
   * The review-time prompt's data: "3 durable items in this order aren't in
   * inventory". Read-only, and empty for an order that does not exist —
   * this is a projection of an order's own lines, not a lookup of one.
   */
  listInventoryProposals: {
    method: 'GET',
    path: '/purchases/:id/inventory-proposals',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ proposals: z.array(InventoryProposalSchema) }) },
    summary: "Unanswered inventory offers derived from an order's durable lines",
  },
  /**
   * Record a per-item opt-in or refusal. Scoped under the order for the
   * reason {@link patchItem} is: a line id alone is a guess.
   *
   * Purchases does not create the inventory row. An accept names a URI the
   * caller has already created on that pillar, which is what keeps a
   * fan-out from writing into someone else's data.
   */
  decideInventoryProposal: {
    method: 'POST',
    path: '/purchases/:id/items/:itemId/inventory-proposal',
    pathParams: z.object({ id: z.string(), itemId: z.string() }),
    body: InventoryProposalDecisionSchema,
    responses: {
      200: z.object({ unit: PurchaseItemUnitSchema }),
      400: ErrorBodySchema,
      404: ErrorBodySchema,
      // Already answered — the caller should refresh rather than retry.
      409: ErrorBodySchema,
    },
    summary: 'Accept or decline one inventory proposal on a line',
  },
  itemsByTag: {
    method: 'GET',
    path: '/items',
    query: ListItemsByTagQuerySchema,
    responses: { 200: z.object({ items: z.array(TaggedItemSchema) }) },
    summary: 'Every line carrying an item tag, across every order',
  },
});
