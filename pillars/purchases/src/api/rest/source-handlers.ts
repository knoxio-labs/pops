/**
 * Handlers for the `source.*` ts-rest sub-router.
 */
import { deleteSource, getSource, listSources, upsertSource } from '../../db/index.js';
import { tryMapServiceError } from './error-mapping.js';
import { toPurchaseSource } from './serializers.js';

import type { z } from 'zod';

import type { UpsertPurchaseSourceBodySchema } from '../../contract/rest-schemas.js';
import type { PurchasesDb } from '../../db/index.js';

type UpsertBody = z.infer<typeof UpsertPurchaseSourceBodySchema>;

export function makeSourceHandlers(db: PurchasesDb) {
  return {
    list: async () => ({
      status: 200 as const,
      body: { items: listSources(db).map(toPurchaseSource) },
    }),

    get: async ({ params }: { params: { id: string } }) => {
      const source = getSource(db, params.id);
      if (source === undefined) {
        return {
          status: 404 as const,
          body: { message: `Purchase source '${params.id}' not found`, code: 'NOT_FOUND' },
        };
      }
      return { status: 200 as const, body: toPurchaseSource(source) };
    },

    upsert: async ({ params, body }: { params: { id: string }; body: UpsertBody }) => {
      try {
        return {
          status: 200 as const,
          body: toPurchaseSource(upsertSource(db, { id: params.id, ...body })),
        };
      } catch (err) {
        const mapped = tryMapServiceError(err);
        if (mapped?.status === 400) return { status: 400 as const, body: mapped.body };
        throw err as Error;
      }
    },

    delete: async ({ params }: { params: { id: string } }) => {
      try {
        if (!deleteSource(db, params.id)) {
          return {
            status: 404 as const,
            body: { message: `Purchase source '${params.id}' not found`, code: 'NOT_FOUND' },
          };
        }
      } catch (err) {
        // Purchases still reference it. Refusing is the point: deleting the
        // source would leave rows the linker can never block on.
        const mapped = tryMapServiceError(err);
        if (mapped?.status === 409) return { status: 409 as const, body: mapped.body };
        throw err as Error;
      }
      return { status: 200 as const, body: { ok: true as const } };
    },
  };
}
