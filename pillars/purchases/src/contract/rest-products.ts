/**
 * The learned product dictionary — `product.*` sub-router.
 *
 * A **product** is a thing a human recognises. An **alias** is one printed
 * wording that resolves to it. Two of the three shipped adapters state no
 * product identifier at all, so for their lines a printed wording is the only
 * evidence of identity there is; these routes are how that evidence is
 * written down, corrected and undone.
 *
 * The surface is deliberately small and every verb is reversible:
 *
 * - `POST /products/proposals` mints an entry per printed wording and retires
 *   the unconfirmed entries no line prints any more;
 * - `PATCH /products/aliases/:aliasId` points a wording at another product
 *   (the merge), gives it one of its own again (the split), and asserts or
 *   retracts the claim;
 * - `DELETE` on either grain forgets it, and the lines fall back to the
 *   on-the-fly grouping they had before.
 *
 * There is no route that infers a mapping between two wordings. It is not an
 * omission — see `db/services/product-dictionary.ts` for why string
 * similarity is the one signal that must not be trusted here.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema, OkSchema } from './rest-schemas.js';
import { IsoTimestampSchema } from './schemas/purchase.js';

const c = initContract();

/** One printed wording that resolves to a product. */
export const ProductAliasSchema = z.object({
  id: z.string(),
  /**
   * How far this wording's claim reaches. Opaque, and deliberately so: it
   * encodes the source and, where the source covers many shops, the merchant.
   * A consumer that wants to show the scope shows `source` and the product's
   * merchants, not this.
   */
  scopeKey: z.string(),
  source: z.string(),
  /** The lookup key — the printed name reduced to what identifies it. */
  normalisedName: z.string(),
  /** A sample of how a till actually printed it. */
  printedName: z.string(),
  /**
   * When a human asserted this wording is that product. Null means a pass
   * proposed it and a later pass may retire it, which is the same marker
   * `purchase_item_tags.confirmedAt` and `purchase_items.kindConfirmedAt`
   * carry.
   */
  confirmedAt: IsoTimestampSchema.nullable(),
  createdAt: IsoTimestampSchema,
});

export const ProductSchema = z.object({
  id: z.string(),
  /**
   * What to call it. Seeded from the wording that minted it, so an untouched
   * proposal wears a till's abbreviation until somebody types the real name.
   */
  label: z.string(),
  createdAt: IsoTimestampSchema,
  /**
   * Every wording that resolves to this product, normalised name ascending.
   * At least one: a product no wording reaches is deleted rather than
   * listed, because nothing could ever group under it.
   */
  aliases: z.array(ProductAliasSchema).min(1),
});

export const ListProductsQuerySchema = z.object({
  /** Only products holding at least one wording under this source. */
  source: z.string().optional(),
  /**
   * `true` keeps products a human has asserted at least one wording of,
   * `false` the ones nobody has touched. Omitted keeps both.
   */
  confirmed: z.enum(['true', 'false']).optional(),
});

/**
 * No `limit`, for the reason the analytics routes have none: a truncated
 * dictionary is indistinguishable from one where the missing wordings simply
 * have no entry, and those are the two states a caller most needs to tell
 * apart.
 */
export const ProductListSchema = z.object({
  products: z.array(ProductSchema),
});

/** What one run of the proposal pass changed. */
export const ProposalOutcomeSchema = z.object({
  /** Lines read — every line, including the sku-keyed ones the pass skips. */
  scannedLines: z.int().min(0),
  /** Distinct scoped wordings the lines print, which is the pass's whole input. */
  observedWordings: z.int().min(0),
  /** Entries minted for a wording that had none. */
  proposed: z.int().min(0),
  /** Unconfirmed entries retired because no line prints that wording any more. */
  retired: z.int().min(0),
  /** Entries left alone because a human asserted them. */
  confirmed: z.int().min(0),
});

export const UpdateProductAliasBodySchema = z
  .object({
    /**
     * Where the wording should point. A product id moves it there — the
     * merge, and the only way two wordings ever become one product. `null`
     * gives it a freshly minted product of its own, which is the split and
     * the undo for a merge that was wrong. Omitted leaves it alone.
     */
    productId: z.string().min(1).nullable().optional(),
    /**
     * `true` asserts the wording is that product and puts the entry beyond
     * the proposal pass's reach; `false` retracts that. Omitted leaves the
     * marker alone, so merging and asserting stay separate decisions.
     */
    confirmed: z.boolean().optional(),
  })
  .refine((body) => body.productId !== undefined || body.confirmed !== undefined, {
    message: 'State productId, confirmed, or both',
  });

export const RenameProductBodySchema = z.object({
  label: z.string().trim().min(1),
});

export const purchasesProductContract = c.router({
  list: {
    method: 'GET',
    path: '/products',
    query: ListProductsQuerySchema,
    responses: { 200: ProductListSchema },
    summary:
      'The learned product dictionary: products and the printed wordings that resolve to them',
  },
  propose: {
    method: 'POST',
    path: '/products/proposals',
    body: z.object({}).optional(),
    responses: { 200: ProposalOutcomeSchema },
    summary:
      'Mint a dictionary entry per printed wording and retire unconfirmed entries nothing prints',
  },
  rename: {
    method: 'PATCH',
    path: '/products/:productId',
    pathParams: z.object({ productId: z.string() }),
    body: RenameProductBodySchema,
    responses: { 200: ProductSchema, 404: ErrorBodySchema },
    summary: 'Rename a product without touching the wordings that resolve to it',
  },
  delete: {
    method: 'DELETE',
    path: '/products/:productId',
    pathParams: z.object({ productId: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Forget a product and every wording that resolved to it',
  },
  updateAlias: {
    method: 'PATCH',
    path: '/products/aliases/:aliasId',
    pathParams: z.object({ aliasId: z.string() }),
    body: UpdateProductAliasBodySchema,
    responses: {
      200: ProductAliasSchema,
      400: ErrorBodySchema,
      // Either the alias or the product it was told to point at.
      404: ErrorBodySchema,
    },
    summary: 'Merge, split, assert or retract one printed wording',
  },
  deleteAlias: {
    method: 'DELETE',
    path: '/products/aliases/:aliasId',
    pathParams: z.object({ aliasId: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Forget one printed wording, returning its lines to the on-the-fly grouping',
  },
});
