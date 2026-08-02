/**
 * Handlers for the `purchase.*` ts-rest sub-router.
 *
 * Returned from a factory so we can close over the per-process drizzle
 * handle without leaking it through Express.
 */
import {
  createPurchase,
  deletePurchase,
  getPurchase,
  listItemsByTag,
  listPurchases,
} from '../../db/index.js';
import { tryMapServiceError } from './error-mapping.js';
import { toPurchaseDetailBody } from './serializers.js';

import type { z } from 'zod';

import type {
  CreatePurchaseBodySchema,
  ListItemsByTagQuerySchema,
  ListPurchasesQuerySchema,
} from '../../contract/rest-schemas.js';
import type { PurchasesDb } from '../../db/index.js';

type ListQuery = z.infer<typeof ListPurchasesQuerySchema>;
type TagQuery = z.infer<typeof ListItemsByTagQuerySchema>;
type CreateBody = z.infer<typeof CreatePurchaseBodySchema>;

function notFound(id: string) {
  return {
    status: 404 as const,
    body: { message: `Purchase ${id} not found`, code: 'NOT_FOUND' },
  };
}

export function makePurchaseHandlers(db: PurchasesDb) {
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
      return { status: 201 as const, body: toPurchaseDetailBody(detail) };
    },

    delete: async ({ params }: { params: { id: string } }) => {
      if (!deletePurchase(db, params.id)) return notFound(params.id);
      return { status: 200 as const, body: { ok: true as const } };
    },

    itemsByTag: async ({ query }: { query: TagQuery }) => ({
      status: 200 as const,
      body: { items: [...listItemsByTag(db, query.tag, query.limit)] },
    }),
  };
}
