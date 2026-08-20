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
 * a display label. `product` is a dictionary entry claiming the wording, and
 * says in its own `confirmed` whether that entry is a person's assertion or
 * another pass's proposal. `unidentified` states outright that the line
 * offered nothing to group on, and carries the line id that is therefore its
 * key.
 *
 * `source` is on every variant because the same string means different
 * things at different merchants. It is not on its own the scope: where one
 * source covers many shops — every uploaded receipt shares one id — the group
 * is keyed on the order's merchant as well, so two shops printing one
 * abbreviation are two rows. Only two things widen a group past that. A
 * source that is a single merchant's own feed groups across the merchant
 * labels it states, which is how a chain's stores stay one product; and a
 * `product` group holds whatever wordings a person pointed at one product,
 * which may span both merchants and sources. So on that one variant `source`
 * describes the line that supplied the printed name rather than bounding the
 * group, and the row's own `merchants` is the complete list either way.
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
    basis: z.literal('product'),
    /**
     * The source that printed {@link name}. Not a bound on the group: a
     * product a human merged across merchants holds lines from several, and
     * the row's own `merchants` is the complete list.
     */
    source: z.string(),
    sku: z.null(),
    /** As the merchant printed it, for display beside the product's own name. */
    name: z.string(),
    /** The product this wording resolves to — the grouping key. */
    productId: z.string(),
    /** The product's own name, which a human may have written. */
    label: z.string(),
    /**
     * Whether a human asserted every wording this group holds. False means
     * at least one of them is a pass's proposal, which is exactly as strong
     * a claim as a `name` group: one wording, one product, nothing merged.
     */
    confirmed: z.boolean(),
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
 * How often a product comes back.
 *
 * A union rather than four nullable numbers, for the reason
 * {@link ProductIdentitySchema} is one: a product bought once has no gap
 * between purchases, and every number that could stand in for one is read
 * as a claim — a zero says "bought again immediately", and a null beside
 * three real figures invites a consumer to render an empty cadence as if it
 * were a slow one.
 *
 * Measured between **distinct orders**, never lines: two bags of the same
 * coffee in one basket are one purchase, and counting them twice would
 * report a cadence of zero for a shopper who bought ahead.
 *
 * Seconds because timestamps are instants and seconds is the largest unit
 * that loses nothing about a gap measured in weeks. Rounding to whole days
 * in the payload would print 6.6 and 7.4 as the same number; how to render
 * it is the consumer's decision, taken from an exact figure.
 *
 * Nothing here is relative to now. "Due for a re-buy" needs a clock, and a
 * read that consulted one would answer differently to two calls a minute
 * apart; `lastPurchasedAt` and the median are what a consumer needs to
 * decide it against its own.
 */
export const ProductCadenceSchema = z.discriminatedUnion('basis', [
  z.object({ basis: z.literal('single-purchase') }),
  z.object({
    basis: z.literal('intervals'),
    /**
     * The middle gap between consecutive purchases, and the figure to lead
     * with: a bursty history's mean describes a rhythm that never happened.
     */
    medianIntervalSeconds: z.int().min(0),
    /** The arithmetic mean. Its distance from the median is how bursty the history is. */
    meanIntervalSeconds: z.int().min(0),
    shortestIntervalSeconds: z.int().min(0),
    longestIntervalSeconds: z.int().min(0),
  }),
]);

/**
 * What one unit of this product has cost, each time it was bought.
 *
 * `purchase_items.unit_price_cents` — the merchant's price for one — and
 * deliberately **not** the landed cost. Allocated shipping and adjustment
 * are shares of an order-level figure spread across that order's lines, so
 * the same product bought alone and bought inside a twenty-line order
 * carries wildly different allocations; a per-unit series built on landed
 * cost moves with the shape of the basket and reports a drift that never
 * happened.
 *
 * Four observations and no verdict. `firstCents` to `lastCents` is the
 * drift; `minCents` and `maxCents` say whether those two ends represent it.
 * A single percentage would be the one number a consumer renders, and it
 * would hide every case where the ends are not representative — a product
 * whose last purchase happened to be on special reads as a permanent price
 * cut.
 *
 * The counts are what say whether the observations are comparable at all,
 * and each is a fact off a column rather than an inference.
 */
export const ProductUnitPriceSchema = z.object({
  /** The earliest line's unit price, ordered by the parsed order instant. */
  firstCents: CentsSchema,
  /** The latest line's unit price, ordered by the parsed order instant. */
  lastCents: CentsSchema,
  minCents: CentsSchema,
  maxCents: CentsSchema,
  /** Lines the merchant marked as sold at a promotional price. */
  promotionalLineCount: z.int().min(0),
  /** Lines the merchant marked as sold at its ordinary price. */
  ordinaryLineCount: z.int().min(0),
  /**
   * Lines whose merchant stated nothing either way — every line from every
   * shipped source but the Woolworths receipt. Its own count rather than
   * folded into the ordinary one, on the three-number rule the merchant
   * roll-up's residual follows: "not marked as a special" and "nobody said"
   * are what separate a price series from an unknown one, and a two-way
   * split would present the second as the first.
   */
  unstatedPromotionLineCount: z.int().min(0),
  /**
   * Lines priced by measure — `0.202 kg NET @ $2.90/kg`, which fruit, veg
   * and the deli counter all are. Such a line carries a quantity of 1 and a
   * unit price equal to what that weight cost, so its "unit price" is a
   * function of what went on the scale: 0.5 kg of bananas against 1.2 kg
   * reads as a 140% rise. Where this is non-zero the figures above are
   * partly weights and the drift is partly a change in how much was bought.
   *
   * Recognised from the merchant prose the ingest adapters store verbatim,
   * which is best-effort in one direction only: a note this misses leaves
   * the caveat unstated, never a figure overstated, because nothing derives
   * a price from it.
   */
  measuredLineCount: z.int().min(0),
});

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
  /** How often it comes back. See {@link ProductCadenceSchema}. */
  cadence: ProductCadenceSchema,
  /** What one of it has cost each time. See {@link ProductUnitPriceSchema}. */
  unitPrice: ProductUnitPriceSchema,
  /**
   * Every merchant this product was bought from, in this currency, and the
   * scope of the group. More than one in two cases and no others: the source
   * is a single merchant's own feed that names its stores, as the Woolworths
   * export does; or a person pointed wordings from several merchants at one
   * dictionary product. Nothing derived ever widens this on its own.
   */
  merchants: z.array(MerchantIdentitySchema).min(1),
});

/**
 * How much of the scope the grouping could identify, over every line in it
 * and before `minOrderCount` withholds anything.
 *
 * The route's honesty check. Exactly one shipped adapter states a product
 * identifier, so a leaderboard over grocery or receipt lines rests almost
 * entirely on printed names — a weaker claim than one over sku-keyed lines,
 * and one no row on its own reveals. The two dictionary figures are counted
 * apart for the same reason: an entry a human asserted is evidence, an entry
 * a pass minted is the printed-name proposal with an id attached.
 */
export const ProductIdentityCoverageSchema = z.object({
  lineCount: z.int().min(0),
  /** Grouped on an identifier the merchant stated. */
  skuKeyedLines: z.int().min(0),
  /** Grouped through a dictionary entry a human asserted. */
  confirmedProductLines: z.int().min(0),
  /** Grouped through a dictionary entry a pass proposed and nobody has confirmed. */
  proposedProductLines: z.int().min(0),
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
      'Repeat purchases per product — cadence, unit-price history, and the identity basis each group was formed on',
  },
});
