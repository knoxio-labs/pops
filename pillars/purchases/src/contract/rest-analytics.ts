/**
 * Aggregate reads — `analytics.*` sub-router.
 *
 * One route per question rather than a generic query endpoint. A generic
 * grouper would let a consumer ask for a projection nobody has reasoned
 * about, and the figures here are exactly the ones that must not be
 * assembled casually: a merchant headline that drops its residual reports a
 * known unknown as a certainty.
 *
 * `GET /purchases` cannot answer this. Building a merchant total from it
 * means paging 500 orders at a time and summing in the browser, which
 * reintroduces the second implementation of the residual that ADR-042's
 * accounting split exists to prevent, and the per-order charge-link state it
 * would need is not in the index at all.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { MERCHANT_RESOLUTIONS, PRODUCT_IDENTITY_BASES } from './constants.js';
import { ErrorBodySchema, ListPurchasesQuerySchema } from './rest-schemas.js';
import { PurchaseAccountingSchema } from './schemas/purchase-detail.js';
import {
  CentsSchema,
  CurrencySchema,
  IsoTimestampSchema,
  NonNegativeCentsSchema,
} from './schemas/purchase.js';

const c = initContract();

export const MerchantResolutionSchema = z.enum(MERCHANT_RESOLUTIONS);

export const ProductIdentityBasisSchema = z.enum(PRODUCT_IDENTITY_BASES);

/**
 * Which merchant a group is, and on what basis.
 *
 * `entity` — grouped on a resolved `contacts` entity id, the operative
 * identity. `name` — grouped on the merchant's label because no entity was
 * ever attached, which is every export-ingested order today; two merchants
 * sharing a label share this group and a rename splits one. `unattributed` —
 * the order names no merchant, and is here rather than dropped so the groups
 * still add up to the spend.
 *
 * A union rather than three optional-looking fields beside a tag, because
 * `resolution` does not describe the row, it constrains it: an `entity` group
 * without an `entityId` and a `name` group without a `name` are both the same
 * bug — a group presented at a confidence its own key cannot support. Flat,
 * that bug validates and reaches a consumer, which then has to re-derive the
 * invariant with a non-null assertion it has no grounds for. The variants are
 * exhaustive over {@link MERCHANT_RESOLUTIONS}, asserted in the contract
 * tests rather than trusted.
 */
export const MerchantIdentitySchema = z.discriminatedUnion('resolution', [
  z.object({
    resolution: z.literal('entity'),
    entityId: z.string(),
    /** An order carrying the id is not obliged to also state the label. */
    name: z.string().nullable(),
  }),
  z.object({
    resolution: z.literal('name'),
    entityId: z.null(),
    /** The grouping key itself, so never absent. */
    name: z.string(),
  }),
  z.object({
    resolution: z.literal('unattributed'),
    entityId: z.null(),
    name: z.null(),
  }),
]);

/**
 * One merchant's spend in one currency.
 *
 * `accounting` is the same six figures `GET /purchases/:id` returns for a
 * single order, summed. The identity survives summation
 * (`totalCents === matchedCents + awaitingImportCents + residualCents`), and
 * so does `netSpendCents === totalCents − refundedCents` — which is why that
 * figure is defined as total less refunds rather than through the buckets: a
 * headline derived from `matched + awaitingImport` would move every time a
 * statement imported or a sweep ran, reporting import history rather than
 * spending.
 *
 * `residualCents` is the unexplained bucket, and it is returned rather than
 * left for a consumer to derive. A view that has to compute it is a view
 * that can forget to.
 */
export const MerchantSpendSchema = z.object({
  merchant: MerchantIdentitySchema,
  currency: CurrencySchema,
  /** Orders in this group, counted once each however many charges they carry. */
  orderCount: z.int().min(0),
  accounting: PurchaseAccountingSchema,
});

export const CurrencySpendSchema = z.object({
  currency: CurrencySchema,
  orderCount: z.int().min(0),
  accounting: PurchaseAccountingSchema,
});

export const MerchantSpendRollupSchema = z.object({
  /** Echoed so a rendered figure carries the window it was computed over. */
  period: z.object({
    from: IsoTimestampSchema.nullable(),
    to: IsoTimestampSchema.nullable(),
  }),
  /** Currency ascending, then net spend descending. */
  merchants: z.array(MerchantSpendSchema),
  /**
   * One entry per currency in scope, never one grand total: no such number
   * exists across currencies, and returning one would be a confident
   * falsehood.
   */
  totals: z.array(CurrencySpendSchema),
});

/**
 * The same scope vocabulary as the order index, minus the page.
 *
 * Derived from it rather than restated so the two cannot disagree about what
 * `from`, `to`, `sources`, `statuses`, `currency` or the merchant parameters
 * select. That identity is what makes a merchant row openable: the drill-down
 * sends this row's scope back to `GET /purchases` and is answered by exactly
 * the orders the row counted, because both go through one set of predicates.
 *
 * There is deliberately no `limit`: a roll-up over the first 500 of 748
 * orders is not a smaller answer, it is a wrong one, and nothing in the
 * response would say so.
 */
export const MerchantSpendQuerySchema = ListPurchasesQuerySchema.omit({
  limit: true,
  offset: true,
});

/**
 * Which lines a product group holds together, and on what evidence.
 *
 * A union rather than a `basis` tag beside optional fields, for the reason
 * {@link MerchantIdentitySchema} is one: the tag constrains the row. Only the
 * `sku` variant carries an identifier a merchant asserted. `name` is a group
 * of printed names that normalise alike — a proposal, which can merge two
 * products a till abbreviates the same way and can split one product printed
 * two ways — and it carries the normalised key it was formed on so a
 * consumer can show what was actually matched rather than inferring it from
 * a display label. `unidentified` states outright that the line offered
 * nothing to group on, and carries the line id that is therefore its key.
 *
 * `source` is on every variant because the same string means different
 * things at different merchants, and a group is only ever within one source.
 * The source is not on its own the scope, though: where one source covers
 * many shops — every uploaded receipt shares one id — the group is keyed on
 * the order's merchant as well, so `merchants` is the set of merchants the
 * group could ever have held and two shops printing one abbreviation are two
 * rows. Only a source that is a single merchant's own feed groups across the
 * merchant labels it states, which is how a chain's stores stay one product.
 */
export const ProductIdentitySchema = z.discriminatedUnion('basis', [
  z.object({
    basis: z.literal('sku'),
    source: z.string(),
    /** The merchant's own identifier. Present, or this is not a sku group. */
    sku: z.string(),
    /** A label from one of the lines. The sku is the identity. */
    name: z.string(),
  }),
  z.object({
    basis: z.literal('name'),
    source: z.string(),
    sku: z.null(),
    /** As the merchant printed it, for display. */
    name: z.string(),
    /** The grouping key itself, so never absent. */
    normalisedName: z.string(),
  }),
  z.object({
    basis: z.literal('unidentified'),
    source: z.string(),
    sku: z.null(),
    name: z.string(),
    /** The grouping key itself — the line's own id, so this group holds one line. */
    itemId: z.string(),
  }),
]);

/**
 * One product's purchase history in one currency.
 *
 * `orderCount` is the leaderboard's own figure — distinct orders, so it does
 * not move with how many charges settled them, and it exceeds neither
 * `lineCount` nor the orders in scope. `landedCostCents` is the same
 * `lineTotal + allocatedShipping + allocatedAdjustment` a line read returns,
 * summed.
 */
export const ProductPurchasesSchema = z.object({
  product: ProductIdentitySchema,
  currency: CurrencySchema,
  /** Distinct orders holding this product — the "across N orders" figure. */
  orderCount: z.int().min(1),
  /** Lines. Exceeds `orderCount` when one order lists the product twice. */
  lineCount: z.int().min(1),
  /** Units, summing each line's quantity. */
  unitCount: z.int().min(0),
  firstPurchasedAt: IsoTimestampSchema,
  lastPurchasedAt: IsoTimestampSchema,
  /** Signed, because an order-level discount can push a line's share negative. */
  landedCostCents: CentsSchema,
  /**
   * Settled refunds recorded against these lines, and gross of any refund
   * recorded at the *order* grain — no adapter attributes one to a line, so
   * this reads 0 for every line the shipped adapters write. Returned beside
   * the landed cost rather than subtracted from it so the two cannot be
   * mistaken for each other.
   */
  refundedCents: NonNegativeCentsSchema,
  /**
   * Every merchant this product was bought from, in this currency, which is
   * also the group's scope. More than one only under a source that is a
   * single merchant's own feed and names its stores.
   */
  merchants: z.array(MerchantIdentitySchema).min(1),
});

/**
 * How much of the scope the grouping could identify, over every line in it
 * and before `minOrderCount` withholds anything.
 *
 * The route's honesty check. Exactly one shipped adapter states a product
 * identifier, so a leaderboard over grocery or receipt lines rests almost
 * entirely on normalised printed names — a weaker claim than one over
 * sku-keyed lines, and one no row on its own reveals.
 */
export const ProductIdentityCoverageSchema = z.object({
  lineCount: z.int().min(0),
  /** Grouped on an identifier the merchant stated. */
  skuKeyedLines: z.int().min(0),
  /** Grouped on a normalised printed name — a proposal, not an assertion. */
  nameKeyedLines: z.int().min(0),
  /** Grouped with nothing: no sku, and no name that normalises to anything. */
  unidentifiedLines: z.int().min(0),
  /**
   * Groups the scope holds, including any `minOrderCount` withheld. One per
   * product *and currency*: a sku bought in two currencies counts twice,
   * because it is two rows.
   */
  productCount: z.int().min(0),
});

export const ProductLeaderboardSchema = z.object({
  /** Echoed so a rendered figure carries the window it was computed over. */
  period: z.object({
    from: IsoTimestampSchema.nullable(),
    to: IsoTimestampSchema.nullable(),
  }),
  /**
   * Echoed for the same reason the period is: it is the criterion by which
   * groups are absent, and a response that did not state it would be
   * indistinguishable from a complete one.
   */
  minOrderCount: z.int().min(1),
  /** Currency ascending, then orders descending, then landed cost descending. */
  products: z.array(ProductPurchasesSchema),
  coverage: ProductIdentityCoverageSchema,
});

/**
 * The scope vocabulary of the merchant roll-up, plus the N.
 *
 * `minOrderCount` is not a page cap. It selects on the answer's own defining
 * property — how many orders a product appears in — is stated by the caller,
 * and is echoed in the response, so a group that is absent is absent for a
 * reason the payload names. There is deliberately still no `limit`: a
 * top-of-list cut would drop rows for a reason nothing records.
 */
export const ProductLeaderboardQuerySchema = MerchantSpendQuerySchema.extend({
  minOrderCount: z.coerce.number().int().min(1).optional(),
});

export const purchasesAnalyticsContract = c.router({
  merchantSpend: {
    method: 'GET',
    path: '/analytics/merchant-spend',
    query: MerchantSpendQuerySchema,
    responses: {
      200: MerchantSpendRollupSchema,
      // Two merchant parameters at once, refused for the same reason the
      // order index refuses them.
      400: ErrorBodySchema,
    },
    summary: 'Spend per merchant and currency over a period, with the explained/unexplained split',
  },
  productLeaderboard: {
    method: 'GET',
    path: '/analytics/product-leaderboard',
    query: ProductLeaderboardQuerySchema,
    responses: {
      200: ProductLeaderboardSchema,
      // Inherited with the scope vocabulary: the same two-merchant-parameter
      // refusal, because this reads the scope the same way.
      400: ErrorBodySchema,
    },
    summary:
      'Repeat purchases per product, each group carrying the identity basis it was formed on',
  },
});
