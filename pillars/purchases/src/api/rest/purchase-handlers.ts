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
  listPurchases,
  type PurchaseDetail,
} from '../../db/index.js';
import { tryMapServiceError } from './error-mapping.js';
import { toPurchase, toPurchaseItem } from './serializers.js';

import type { z } from 'zod';

import type {
  CreatePurchaseBodySchema,
  ListPurchasesQuerySchema,
} from '../../contract/rest-schemas.js';
import type { PurchasesDb } from '../../db/index.js';

type ListQuery = z.infer<typeof ListPurchasesQuerySchema>;
type CreateBody = z.infer<typeof CreatePurchaseBodySchema>;

function toDetailBody(detail: PurchaseDetail) {
  return {
    purchase: toPurchase(detail.purchase),
    items: detail.items.map(toPurchaseItem),
    links: [...detail.links],
    residualCents: detail.residualCents,
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
      return { status: 200 as const, body: { items: items.map(toPurchase) } };
    },

    get: async ({ params }: { params: { id: string } }) => {
      const detail = getPurchase(db, params.id);
      if (detail === undefined) {
        return {
          status: 404 as const,
          body: { message: `Purchase ${params.id} not found`, code: 'NOT_FOUND' },
        };
      }
      return { status: 200 as const, body: toDetailBody(detail) };
    },

    create: async ({ body }: { body: CreateBody }) => {
      try {
        const detail = createPurchase(db, body);
        return { status: 201 as const, body: toDetailBody(detail) };
      } catch (err) {
        const mapped = tryMapServiceError(err);
        if (mapped?.status === 409) return { status: 409 as const, body: mapped.body };
        if (mapped?.status === 400) return { status: 400 as const, body: mapped.body };
        // A source that isn't registered is the caller's mistake, not a
        // missing resource on the path — report it as a bad request.
        if (mapped?.status === 404) return { status: 400 as const, body: mapped.body };
        throw err as Error;
      }
    },

    delete: async ({ params }: { params: { id: string } }) => {
      if (!deletePurchase(db, params.id)) {
        return {
          status: 404 as const,
          body: { message: `Purchase ${params.id} not found`, code: 'NOT_FOUND' },
        };
      }
      return { status: 200 as const, body: { ok: true as const } };
    },
  };
}
