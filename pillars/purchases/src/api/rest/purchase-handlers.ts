/**
 * Handlers for the `purchase.*` ts-rest sub-router.
 *
 * Returned from a factory so we can close over the per-process drizzle
 * handle without leaking it through Express.
 */
import {
  attachDocument,
  createPurchase,
  deletePurchase,
  eraseCaptureLocation,
  getPurchase,
  listItemsByTag,
  listPurchaseRows,
} from '../../db/index.js';
import { createMerchantResolver, type MerchantResolver } from '../contacts/merchant.js';
import { paginationMeta } from '../shared/pagination.js';
import { tryMapServiceError } from './error-mapping.js';
import { makePurchaseInventoryHandlers } from './purchase-inventory-handlers.js';
import { resolvePurchaseListKeyset } from './purchase-list-keyset.js';
import { makePurchaseManualHandlers } from './purchase-manual-handlers.js';
import { resolvePurchaseScope } from './purchase-scope.js';
import { toPurchaseDetailBody, toPurchaseItemBody } from './serializers.js';

import type { z } from 'zod';

import type {
  AttachDocumentBodySchema,
  CreatePurchaseBodySchema,
  ListItemsByTagQuerySchema,
  ListPurchasesQuerySchema,
} from '../../contract/rest-schemas.js';
import type { PurchasesDb } from '../../db/index.js';

type ListQuery = z.infer<typeof ListPurchasesQuerySchema>;
type TagQuery = z.infer<typeof ListItemsByTagQuerySchema>;
type CreateBody = z.infer<typeof CreatePurchaseBodySchema>;
type AttachDocumentBody = z.infer<typeof AttachDocumentBodySchema>;

const ITEMS_BY_TAG_DEFAULT_LIMIT = 200;

function notFound(id: string) {
  return {
    status: 404 as const,
    body: { message: `Purchase ${id} not found`, code: 'NOT_FOUND' },
  };
}

export function makePurchaseHandlers(
  db: PurchasesDb,
  onIngest: () => void = () => undefined,
  merchant: MerchantResolver = createMerchantResolver()
) {
  return {
    list: async ({ query }: { query: ListQuery }) => {
      const scope = resolvePurchaseScope(query);
      if (!scope.ok) return { status: 400 as const, body: scope.body };

      const keyset = resolvePurchaseListKeyset(query);
      if (!keyset.ok) return { status: 400 as const, body: keyset.body };

      const rows = listPurchaseRows(db, {
        ...scope.scope,
        limit: query.limit,
        offset: query.offset,
        beforeOrderedAt: keyset.beforeOrderedAt,
        beforeId: keyset.beforeId,
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

    ...makePurchaseManualHandlers(db, merchant),

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

    eraseCaptureLocation: async ({ params }: { params: { id: string } }) => {
      if (!eraseCaptureLocation(db, params.id)) return notFound(params.id);
      return { status: 200 as const, body: { ok: true as const } };
    },

    ...makePurchaseInventoryHandlers(db),

    itemsByTag: async ({ query }: { query: TagQuery }) => {
      const limit = query.limit ?? ITEMS_BY_TAG_DEFAULT_LIMIT;
      const offset = query.offset ?? 0;
      const { rows, total } = listItemsByTag(db, query.tag, limit, offset);
      return {
        status: 200 as const,
        body: {
          items: rows.map((row) => ({
            item: toPurchaseItemBody(row.item),
            confirmedAt: row.confirmedAt,
          })),
          pagination: paginationMeta(total, limit, offset),
        },
      };
    },
  };
}
