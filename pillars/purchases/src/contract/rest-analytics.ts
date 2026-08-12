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

import { MERCHANT_RESOLUTIONS } from './constants.js';
import { ListPurchasesQuerySchema } from './rest-schemas.js';
import {
  CurrencySchema,
  IsoTimestampSchema,
  PurchaseAccountingSchema,
} from './schemas/purchase.js';

const c = initContract();

export const MerchantResolutionSchema = z.enum(MERCHANT_RESOLUTIONS);

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
 * `from`, `to`, `sources` or `statuses` select. There is deliberately no
 * `limit`: a roll-up over the first 500 of 748 orders is not a smaller
 * answer, it is a wrong one, and nothing in the response would say so.
 */
export const MerchantSpendQuerySchema = ListPurchasesQuerySchema.omit({
  limit: true,
  offset: true,
});

export const purchasesAnalyticsContract = c.router({
  merchantSpend: {
    method: 'GET',
    path: '/analytics/merchant-spend',
    query: MerchantSpendQuerySchema,
    responses: { 200: MerchantSpendRollupSchema },
    summary: 'Spend per merchant and currency over a period, with the explained/unexplained split',
  },
});
