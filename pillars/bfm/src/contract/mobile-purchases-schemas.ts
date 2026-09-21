/**
 * The purchases list, its detail record, and the home screen's month
 * summary — everything the mobile purchases surface's wire shapes describe.
 *
 * Split out of `rest-schemas.ts`, which is at the pillar's line cap, for the
 * same reason `account.ts` and `mobile-inventory-schemas.ts` are their own
 * files beside it: one screen's shapes, not a second copy of the mobile
 * vocabulary.
 */
import { z } from 'zod';

/**
 * One row of the mobile purchases list.
 *
 * Everything a row draws and nothing else. Two of these fields are the whole
 * reason this shape exists rather than a proxy of `purchases`' own record:
 * `itemCount` and `receiptUri` are aggregates the producer computes for the
 * page, so a list of twenty orders is one request rather than twenty-one.
 */
export const MobilePurchaseSchema = z.object({
  id: z.string(),
  /** Display name of the merchant, or null when purchases resolved none. */
  merchantName: z.string().nullable(),
  /**
   * Integer cents, mirroring `purchases`' own wire field exactly. The finance
   * leg beside this one mirrors decimal dollars because that is what finance
   * publishes; normalising the two here would put a conversion and a rounding
   * rule between a producer and a screen.
   */
  totalCents: z.int(),
  /** ISO 4217, as the order states it. Open string, for the same reason a transaction's currency is. */
  currency: z.string(),
  /**
   * The calendar day the order is dated, `YYYY-MM-DD`.
   *
   * A DAY, not an instant, because that is what a row renders and what the
   * reader means by "when". `purchases` stores the instant in UTC and the
   * offset it was placed at separately, and the day is computed here from
   * the pair — the local day where the order happened — rather than left to
   * a client that would resolve it in whatever zone the handset is currently
   * standing in. A phone that flies to another timezone must not re-date a
   * purchase it already showed.
   *
   * Falls back to the day in UTC for an order whose offset that pillar never
   * recorded, which is every row written before it had a column for one.
   */
  orderedOn: z.string(),
  /** How many lines the order has. `0` is normal for a receipt read as a total alone. */
  itemCount: z.int().min(0),
  /**
   * Reconciliation state, verbatim from `purchases`: `awaiting_settlement`,
   * `linked`, `partial`, `settled_cash`, `ignored`.
   *
   * An open string rather than an enum, and NOT collapsed to a boolean.
   * `awaiting_settlement` is a normal permanent state rather than a problem,
   * and `partial` is neither settled nor unsettled — a `settled: false` would
   * make two different facts look like one. Open for the distribution reason
   * every other vocabulary on this wire is open: a value added by the producer
   * must not fail the whole page's decode on an installed build.
   */
  status: z.string(),
  /**
   * The `pops://` URI of the order's receipt, or null when it has none.
   *
   * A reference rather than the image: a page of orders carrying inline
   * base64 is a megabyte on cellular, and the same receipt would be re-sent
   * every time it appeared. Nothing serves these bytes yet — the phone can
   * key a cache on it and recognise two rows as the same receipt, and cannot
   * draw it. See the pillar README.
   */
  receiptUri: z.string().nullable(),
});

export type MobilePurchase = z.infer<typeof MobilePurchaseSchema>;

/** One line of an order, as the detail screen lists it. */
export const MobilePurchaseItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.int().min(1),
  /** What the line cost in total, integer cents. Not the unit price times quantity — the source states it. */
  lineTotalCents: z.int(),
});

export type MobilePurchaseItem = z.infer<typeof MobilePurchaseItemSchema>;

/**
 * The fuller record behind one list row.
 *
 * It adds the breakdown and the lines, and it adds `orderedAt` beside the day
 * — the instant, offset included, for anything that genuinely needs one. The
 * day stays authoritative for rendering: a client must never re-derive
 * `orderedOn` from `orderedAt`, which is how a purchase made at 9pm comes to
 * show yesterday's date on a phone that has since moved west.
 */
export const MobilePurchaseDetailSchema = MobilePurchaseSchema.extend({
  /** ISO-8601 with the offset `purchases` recorded. Evidence, not a rendering instruction. */
  orderedAt: z.string(),
  subtotalCents: z.int(),
  taxCents: z.int(),
  shippingCents: z.int(),
  discountCents: z.int(),
  /** A fee the merchant added: a card surcharge, a small-order fee. */
  surchargeCents: z.int(),
  /** Where the order came from — an adapter id, or the receipt drop-zone. Open string. */
  source: z.string(),
  items: z.array(MobilePurchaseItemSchema),
});

export type MobilePurchaseDetail = z.infer<typeof MobilePurchaseDetailSchema>;

/**
 * One page of the purchases list.
 *
 * Same shape as `MobileTransactionsPageSchema` and the same rule: the
 * cursor is opaque, `null` on the last page, and the app asks for the next
 * page by echoing it back rather than by counting rows.
 */
export const MobilePurchasesPageSchema = z.object({
  data: z.array(MobilePurchaseSchema),
  nextCursor: z.string().nullable(),
  total: z.int().min(0).nullable().optional(),
});

export type MobilePurchasesPage = z.infer<typeof MobilePurchasesPageSchema>;

/** One currency's spend for a month summary. Never mixed across currencies. */
export const MobileMonthCurrencyTotalSchema = z.object({
  currency: z.string(),
  orderCount: z.int().min(0),
  totalCents: z.int(),
  /** Total less refunds. `purchases`' own headline figure for a spend total. */
  netSpendCents: z.int(),
});

export type MobileMonthCurrencyTotal = z.infer<typeof MobileMonthCurrencyTotalSchema>;

/** One merchant's spend in one currency, for the month summary's leaderboard. */
export const MobileMonthMerchantLeaderSchema = z.object({
  /** `null` for an order naming no merchant, same as a list row's `merchantName`. */
  merchantName: z.string().nullable(),
  currency: z.string(),
  netSpendCents: z.int(),
  orderCount: z.int().min(0),
});

export type MobileMonthMerchantLeader = z.infer<typeof MobileMonthMerchantLeaderSchema>;

/** The home screen's figures for one calendar month. */
export const MobileMonthSummarySchema = z.object({
  month: z.string(),
  totals: z.array(MobileMonthCurrencyTotalSchema),
  purchaseCount: z.int().min(0),
  /** `null` when the previous month has no orders at all, not an empty array. */
  previousMonthTotals: z.array(MobileMonthCurrencyTotalSchema).nullable(),
  unmatchedCount: z.int().min(0),
  merchantLeaders: z.array(MobileMonthMerchantLeaderSchema),
});

export type MobileMonthSummary = z.infer<typeof MobileMonthSummarySchema>;
