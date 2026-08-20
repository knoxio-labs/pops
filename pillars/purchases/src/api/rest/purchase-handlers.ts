/**
 * Handlers for the `purchase.*` ts-rest sub-router.
 *
 * Returned from a factory so we can close over the per-process drizzle
 * handle without leaking it through Express.
 */
import {
  attachDocument,
  confirmItemClassification,
  createPurchase,
  decideInventoryProposal,
  deletePurchase,
  getPurchase,
  listInventoryProposals,
  listItemsByTag,
  listPurchaseRows,
} from '../../db/index.js';
import { tryMapServiceError } from './error-mapping.js';
import { resolvePurchaseScope } from './purchase-scope.js';
import {
  toPurchaseDetailBody,
  toPurchaseItemBody,
  toPurchaseItemDetailBody,
} from './serializers.js';

import type { z } from 'zod';

import type { InventoryProposalDecisionSchema } from '../../contract/inventory-proposals.js';
import type {
  AttachDocumentBodySchema,
  CreatePurchaseBodySchema,
  ListItemsByTagQuerySchema,
  ListPurchasesQuerySchema,
  PatchItemBodySchema,
} from '../../contract/rest-schemas.js';
import type { PurchasesDb } from '../../db/index.js';

type ListQuery = z.infer<typeof ListPurchasesQuerySchema>;
type TagQuery = z.infer<typeof ListItemsByTagQuerySchema>;
type CreateBody = z.infer<typeof CreatePurchaseBodySchema>;
type AttachDocumentBody = z.infer<typeof AttachDocumentBodySchema>;
type PatchItemBody = z.infer<typeof PatchItemBodySchema>;
type ProposalDecisionBody = z.infer<typeof InventoryProposalDecisionSchema>;

function notFound(id: string) {
  return {
    status: 404 as const,
    body: { message: `Purchase ${id} not found`, code: 'NOT_FOUND' },
  };
}

/**
 * One 404 for "no such order" and "no such line on it", because
 * distinguishing them tells a caller holding a wrong order id that the line
 * exists somewhere else.
 */
function itemNotFound(purchaseId: string, itemId: string) {
  return {
    status: 404 as const,
    body: {
      message: `Item ${itemId} not found on purchase ${purchaseId}`,
      code: 'NOT_FOUND',
    },
  };
}

/**
 * The same 404, for a route that also reaches it when the line is real and
 * the named unit is not. It says only that nothing here answers the
 * request, which is true of all three cases — where "item not found" would
 * be a false statement to a caller who supplied a good line and a bad unit.
 */
function proposalNotFound(purchaseId: string, itemId: string) {
  return {
    status: 404 as const,
    body: {
      message: `No inventory proposal on item ${itemId} of purchase ${purchaseId} matches this answer`,
      code: 'NOT_FOUND',
    },
  };
}

export function makePurchaseHandlers(db: PurchasesDb, onIngest: () => void = () => undefined) {
  return {
    list: async ({ query }: { query: ListQuery }) => {
      const scope = resolvePurchaseScope(query);
      if (!scope.ok) return { status: 400 as const, body: scope.body };

      const rows = listPurchaseRows(db, {
        ...scope.scope,
        limit: query.limit,
        offset: query.offset,
      });
      return {
        status: 200 as const,
        body: {
          items: rows.map((row) => ({
            ...row.purchase,
            itemCount: row.itemCount,
            receiptUri: row.receiptUri,
          })),
        },
      };
    },

    get: async ({ params }: { params: { id: string } }) => {
      const detail = getPurchase(db, params.id);
      if (detail === undefined) return notFound(params.id);
      return { status: 200 as const, body: toPurchaseDetailBody(detail) };
    },

    create: async ({ body }: { body: CreateBody }) => {
      let id: string;
      try {
        id = createPurchase(db, body);
      } catch (err) {
        const mapped = tryMapServiceError(err);
        if (mapped?.status === 409) return { status: 409 as const, body: mapped.body };
        if (mapped?.status === 400) return { status: 400 as const, body: mapped.body };
        // A source that isn't registered is the caller's mistake, not a
        // missing resource on the path — report it as a bad request.
        if (mapped?.status === 404) return { status: 400 as const, body: mapped.body };
        throw err as Error;
      }
      const detail = getPurchase(db, id);
      if (detail === undefined) {
        throw new Error(`createPurchase returned id ${id} but it could not be read back`);
      }
      // Trigger 1, fired only after the write succeeded, and swallowed.
      // The order is already committed by this point: letting a scheduling
      // failure turn a successful ingest into a 500 would make the caller
      // retry a write that already happened, and a backfill would report
      // failures for orders that are sitting in the database. The runner
      // also collapses a backfill's 748 calls into one sweep, so this is
      // cheap as well as safe.
      try {
        onIngest();
      } catch (err) {
        console.error('[purchases-api] ingest sweep trigger failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return { status: 201 as const, body: toPurchaseDetailBody(detail) };
    },

    attachDocument: async ({
      params,
      body,
    }: {
      params: { id: string };
      body: AttachDocumentBody;
    }) => {
      try {
        return { status: 201 as const, body: { document: attachDocument(db, params.id, body) } };
      } catch (err) {
        const mapped = tryMapServiceError(err);
        if (mapped?.status === 409) return { status: 409 as const, body: mapped.body };
        if (mapped?.status === 404) return { status: 404 as const, body: mapped.body };
        throw err as Error;
      }
    },

    delete: async ({ params }: { params: { id: string } }) => {
      if (!deletePurchase(db, params.id)) return notFound(params.id);
      return { status: 200 as const, body: { ok: true as const } };
    },

    patchItem: async ({
      params,
      body,
    }: {
      params: { id: string; itemId: string };
      body: PatchItemBody;
    }) => {
      let detail;
      try {
        detail = confirmItemClassification(db, params.id, params.itemId, body);
      } catch (err) {
        const mapped = tryMapServiceError(err);
        if (mapped?.status === 400) return { status: 400 as const, body: mapped.body };
        throw err as Error;
      }
      if (detail === undefined) return itemNotFound(params.id, params.itemId);
      return { status: 200 as const, body: toPurchaseItemDetailBody(detail) };
    },

    listInventoryProposals: async ({ params }: { params: { id: string } }) => ({
      status: 200 as const,
      body: {
        proposals: listInventoryProposals(db, params.id).map((proposal) => ({ ...proposal })),
      },
    }),

    decideInventoryProposal: async ({
      params,
      body,
    }: {
      params: { id: string; itemId: string };
      body: ProposalDecisionBody;
    }) => {
      let unit;
      try {
        unit = decideInventoryProposal(db, params.id, params.itemId, body);
      } catch (err) {
        const mapped = tryMapServiceError(err);
        if (mapped?.status === 409) return { status: 409 as const, body: mapped.body };
        if (mapped?.status === 400) return { status: 400 as const, body: mapped.body };
        throw err as Error;
      }
      if (unit === undefined) return proposalNotFound(params.id, params.itemId);
      return { status: 200 as const, body: { unit } };
    },

    itemsByTag: async ({ query }: { query: TagQuery }) => ({
      status: 200 as const,
      body: {
        items: listItemsByTag(db, query.tag, query.limit).map((row) => ({
          item: toPurchaseItemBody(row.item),
          confirmedAt: row.confirmedAt,
        })),
      },
    }),
  };
}
