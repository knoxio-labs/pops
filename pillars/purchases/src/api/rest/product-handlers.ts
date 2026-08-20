/**
 * Handlers for the `product.*` ts-rest sub-router.
 *
 * Thin: the dictionary's rules — what a pass may retire, what a confirmation
 * puts beyond its reach, when an emptied product is removed — all live under
 * `db/services/product-dictionary*.ts`, because they are invariants of the
 * data rather than of the wire.
 */
import {
  deleteAlias,
  deleteProduct,
  getProduct,
  listProducts,
  proposeProducts,
  renameProduct,
  updateAlias,
} from '../../db/index.js';
import { tryMapServiceError } from './error-mapping.js';

import type { z } from 'zod';

import type {
  ListProductsQuerySchema,
  RenameProductBodySchema,
  UpdateProductAliasBodySchema,
} from '../../contract/rest-products.js';
import type { ProductWithAliases, PurchasesDb } from '../../db/index.js';

type ListQuery = z.infer<typeof ListProductsQuerySchema>;
type RenameBody = z.infer<typeof RenameProductBodySchema>;
type UpdateAliasBody = z.infer<typeof UpdateProductAliasBodySchema>;

function notFound(message: string) {
  return { status: 404 as const, body: { message, code: 'NOT_FOUND' } };
}

/** Re-throw anything that is not a service error this contract declares. */
function asNotFound(err: unknown) {
  const mapped = tryMapServiceError(err);
  if (mapped?.status === 404) return { status: 404 as const, body: mapped.body };
  throw err;
}

/**
 * Widen the service layer's `readonly` arrays into the mutable ones ts-rest's
 * response types expect.
 */
function serialize(entry: ProductWithAliases) {
  return { ...entry.product, aliases: entry.aliases.map((alias) => ({ ...alias })) };
}

export function makeProductHandlers(db: PurchasesDb) {
  return {
    list: async ({ query }: { query: ListQuery }) => ({
      status: 200 as const,
      body: {
        products: listProducts(db, {
          source: query.source,
          confirmed: query.confirmed === undefined ? undefined : query.confirmed === 'true',
        }).map(serialize),
      },
    }),

    propose: async () => ({ status: 200 as const, body: proposeProducts(db) }),

    rename: async ({ params, body }: { params: { productId: string }; body: RenameBody }) => {
      try {
        renameProduct(db, params.productId, body.label);
      } catch (err) {
        return asNotFound(err);
      }
      // Re-read rather than serialise the updated row: the response carries
      // the product's wordings, and a rename does not know them.
      const renamed = getProduct(db, params.productId);
      if (renamed === undefined) return notFound(`Product '${params.productId}' not found`);
      return { status: 200 as const, body: serialize(renamed) };
    },

    delete: async ({ params }: { params: { productId: string } }) => {
      if (!deleteProduct(db, params.productId)) {
        return notFound(`Product '${params.productId}' not found`);
      }
      return { status: 200 as const, body: { ok: true as const } };
    },

    updateAlias: async ({
      params,
      body,
    }: {
      params: { aliasId: string };
      body: UpdateAliasBody;
    }) => {
      try {
        return { status: 200 as const, body: updateAlias(db, params.aliasId, body) };
      } catch (err) {
        return asNotFound(err);
      }
    },

    deleteAlias: async ({ params }: { params: { aliasId: string } }) => {
      if (!deleteAlias(db, params.aliasId)) {
        return notFound(`Product alias '${params.aliasId}' not found`);
      }
      return { status: 200 as const, body: { ok: true as const } };
    },
  };
}
