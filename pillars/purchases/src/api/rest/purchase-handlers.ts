/**
 * Handlers for the `purchase.*` ts-rest sub-router.
 *
 * Returned from a factory so we can close over the per-process drizzle
 * handle without leaking it through Express.
 */
import {
  confirmItemClassification,
  createPurchase,
  deletePurchase,
  getPurchase,
  listItemsByTag,
  listPurchases,
} from '../../db/index.js';
import { tryMapServiceError } from './error-mapping.js';
import {
  toPurchaseDetailBody,
  toPurchaseItemBody,
  toPurchaseItemDetailBody,
} from './serializers.js';

import type { z } from 'zod';

import type {
  CreatePurchaseBodySchema,
  ListItemsByTagQuerySchema,
  ListPurchasesQuerySchema,
  PatchItemBodySchema,
} from '../../contract/rest-schemas.js';
import type { PurchasesDb } from '../../db/index.js';

type ListQuery = z.infer<typeof ListPurchasesQuerySchema>;
type TagQuery = z.infer<typeof ListItemsByTagQuerySchema>;
type CreateBody = z.infer<typeof CreatePurchaseBodySchema>;
type PatchItemBody = z.infer<typeof PatchItemBodySchema>;

function notFound(id: string) {
  return {
    status: 404 as const,
    body: { message: `Purchase ${id} not found`, code: 'NOT_FOUND' },
  };
}

export function makePurchaseHandlers(db: PurchasesDb, onIngest: () => void = () => undefined) {
  return {
    list: async ({ query }: { query: ListQuery }) => {
      const items = listPurchases(db, {
        sources: query.sources,
        statuses: query.statuses,
        from: query.from,
        to: query.to,
        limit: query.limit,
        offset: query.offset,
      });
      return { status: 200 as const, body: { items: [...items] } };
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
      if (detail === undefined) {
        // One 404 for "no such order" and "no such line on it", because
        // distinguishing them tells a caller holding a wrong order id that
        // the line exists somewhere else.
        return {
          status: 404 as const,
          body: {
            message: `Item ${params.itemId} not found on purchase ${params.id}`,
            code: 'NOT_FOUND',
          },
        };
      }
      return { status: 200 as const, body: toPurchaseItemDetailBody(detail) };
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
