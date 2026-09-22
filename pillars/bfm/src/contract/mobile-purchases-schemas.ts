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
 * Who a purchase was made from, and how confidently that is known — mirrors
 * `purchases`' own `MerchantIdentitySchema` (`contract/rest-analytics.ts`),
 * not imported from it: a pillar contract is never imported across the
 * boundary (ADR-040), so this is bfm's own copy of the same three-way shape.
 *
 * `entity` — bfm resolved `entityId` to a `contacts` entity and, when that
 * lookup answered, its name. `name` is null rather than omitted when the
 * lookup failed or the entity carries none, so a phone that only checks
 * `resolution` never has to guess whether a missing field means "unresolved"
 * or "resolved to nothing" — see `entity.name` docs below.
 * `name` — no entity, only the till's own wording.
 * `unattributed` — the order names no merchant at all.
 *
 * A discriminated union rather than one optional field beside a tag, for the
 * same reason `purchases`' version is one: `resolution` CONSTRAINS the row.
 * An `entity` row with no `entityId` and a `name` row with no `name` are the
 * same bug — a resolution presented at a confidence its own data does not
 * support.
 */
export const MobileMerchantIdentitySchema = z.discriminatedUnion('resolution', [
  z.object({
    resolution: z.literal('entity'),
    entityId: z.string(),
    /**
     * The contacts entity's own name — the one a person would recognise.
     * Null when bfm's batched lookup could not name it: the lookup failed,
     * the entity carries no name, or (rare) `purchases` sent an id contacts
     * no longer holds. A phone falls back to the till's own wording
     * (`merchantName`) in that case, never to a blank.
     */
    name: z.string().nullable(),
  }),
  z.object({
    resolution: z.literal('name'),
    /** The grouping key itself, so never absent. */
    name: z.string(),
  }),
  z.object({
    resolution: z.literal('unattributed'),
  }),
]);

export type MobileMerchantIdentity = z.infer<typeof MobileMerchantIdentitySchema>;

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
  /**
   * The three-way merchant identity (POPS-3634): which of `contacts`, the
   * till's own printed wording, or nothing this purchase carries.
   */
  merchant: MobileMerchantIdentitySchema,
  /**
   * The till's own printed wording, or null when purchases resolved none.
   *
   * @deprecated Superseded by `merchant`, which also carries the resolved
   * `contacts` entity name and id. Kept for one release so an installed
   * build older than this change keeps decoding; removing it needs its own
   * ticket (filed: POPS-4317).
   */
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
/**
 * One field a saved-purchase edit changed (POPS-2458). Open string for
 * `field` rather than the producer's closed vocabulary, for the reason
 * `status` is open on the list row: `purchases` adding an edit field must
 * not fail an installed build's decode of the whole detail.
 */
export const MobilePurchaseFieldChangeSchema = z.object({
  field: z.string(),
  itemId: z.string().nullable(),
  original: z.string().nullable(),
  current: z.string().nullable(),
});

export type MobilePurchaseFieldChange = z.infer<typeof MobilePurchaseFieldChangeSchema>;

/** The detail's "Edited &lt;date&gt;" notice and its Original sheet. `null` for a never-edited purchase. */
export const MobilePurchaseEditSchema = z.object({
  editedAt: z.string(),
  changes: z.array(MobilePurchaseFieldChangeSchema),
});

export type MobilePurchaseEdit = z.infer<typeof MobilePurchaseEditSchema>;

export const MobilePurchaseDetailSchema = MobilePurchaseSchema.extend({
  /** ISO-8601 with the offset `purchases` recorded. Evidence, not a rendering instruction. */
  orderedAt: z.string(),
  /**
   * The row's own last-write instant, verbatim from `purchases`. Echoed back
   * as `expectedUpdatedAt` on `PATCH /mobile/purchases/:id` — the phone
   * never computes or displays it, only carries it.
   *
   * Nullable: a producer build that predates the edit feature (POPS-2458)
   * sends none, and bfm has nothing to fabricate one from. A phone reading
   * `null` here has no compare-and-swap value to offer, so `expectedUpdatedAt`
   * stays a required field on the write body rather than becoming optional
   * — an edit is refused outright for want of it, never accepted without
   * the staleness check.
   */
  updatedAt: z.string().nullable(),
  subtotalCents: z.int(),
  taxCents: z.int(),
  shippingCents: z.int(),
  discountCents: z.int(),
  /** A fee the merchant added: a card surcharge, a small-order fee. */
  surchargeCents: z.int(),
  /** Where the order came from — an adapter id, or the receipt drop-zone. Open string. */
  source: z.string(),
  items: z.array(MobilePurchaseItemSchema),
  /** `null` for a purchase nobody has ever edited. See {@link MobilePurchaseEditSchema}. */
  edit: MobilePurchaseEditSchema.nullable(),
});

export type MobilePurchaseDetail = z.infer<typeof MobilePurchaseDetailSchema>;

/**
 * One line as an edit states it should look afterwards. `id` present means
 * "this existing line, changed to look like this"; absent means "a new
 * line". Mirrors `purchases`' own `UpdatePurchaseLineBodySchema`.
 */
export const MobileUpdatePurchaseLineSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  quantity: z.int().min(1),
  lineTotalCents: z.int(),
});

/**
 * `PATCH /mobile/purchases/:id` (POPS-2458). Every header field is optional
 * — absent means unchanged — but merchant, `orderedAt` and `totalCents` are
 * refused on a matched, part-matched, or unrecognised-status purchase.
 * `lines` is always the FULL set the purchase should hold afterwards, not a
 * delta. `expectedUpdatedAt` is a compare-and-swap against the row's own
 * last-write instant, read from the same detail the edit was opened
 * against — a stale value is refused rather than silently overwritten.
 */
export const MobileUpdatePurchaseBodySchema = z.object({
  merchantEntityId: z.string().nullable().optional(),
  merchantEntityName: z.string().nullable().optional(),
  orderedAt: z.string().optional(),
  totalCents: z.int().min(0).optional(),
  subtotalCents: z.int().min(0).optional(),
  taxCents: z.int().min(0).optional(),
  shippingCents: z.int().min(0).optional(),
  discountCents: z.int().min(0).optional(),
  surchargeCents: z.int().min(0).optional(),
  lines: z.array(MobileUpdatePurchaseLineSchema),
  expectedUpdatedAt: z.string(),
});

export type MobileUpdatePurchaseBody = z.infer<typeof MobileUpdatePurchaseBodySchema>;

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

/**
 * `purchases`' own reconciliation vocabulary (`PURCHASE_STATUSES`,
 * `pillars/purchases/src/contract/constants.ts`), restated rather than
 * imported per ADR-040. Closed here rather than left open like a list row's
 * own `status`: this is a QUERY PARAMETER naming one status to filter by,
 * not a value every future row must still decode, so an unrecognised one can
 * afford to 400 immediately instead of round-tripping to the pillar only to
 * be refused there.
 */
const MOBILE_SEARCH_STATUSES = [
  'awaiting_settlement',
  'linked',
  'partial',
  'settled_cash',
  'ignored',
] as const;

/** `GET /mobile/purchases/search`'s query. */
export const MobileSearchQuerySchema = z.object({
  q: z.string().trim().min(1),
  /**
   * Forwarded verbatim as `purchases`' `status eq` search filter — narrowing
   * on the SERVER, because the pillar's search is itself capped per adapter
   * and a client-side filter over a capped answer misses matches the server
   * never sent.
   */
  status: z.enum(MOBILE_SEARCH_STATUSES).optional(),
  /**
   * Chosen item tags, forwarded as `purchases`' own `tags eq` search filter
   * (any-of semantics: a line carrying any of them matches, and the purchase
   * holding such a line matches through it). Absent or empty narrows nothing,
   * exactly as sending none of `purchases`' own filter fields does.
   */
  tags: z.array(z.string().trim().min(1)).optional(),
});

export type MobileSearchQuery = z.infer<typeof MobileSearchQuerySchema>;

/**
 * One purchase hit: an order whose merchant matched.
 *
 * `matchField` and `matchedText` (POPS-4308) say WHAT matched, mirroring the
 * producer's own `SearchHitSchema` (`pillars/purchases/src/contract/
 * rest-search.ts`) rather than inventing a second vocabulary — a phone that
 * highlights the matched text needs to know which field it came from and
 * what the matched substring actually was, and the producer's ranking
 * already carries both.
 */
export const MobilePurchaseSearchHitSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('purchase'),
    id: z.string(),
    merchantName: z.string().nullable(),
    totalCents: z.int(),
    currency: z.string(),
    orderedOn: z.string(),
    status: z.string(),
    matchField: z.string(),
    /** The matched substring itself, or null when the match carries none worth showing (e.g. a name match — the name is already on screen). */
    matchedText: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('item'),
    id: z.string(),
    /** The order this line belongs to — a line hit is meaningless without it. */
    purchaseId: z.string(),
    name: z.string(),
    quantity: z.int().min(1),
    lineTotalCents: z.int(),
    currency: z.string(),
    merchantName: z.string().nullable(),
    orderedOn: z.string(),
    /** The order's own reconciliation status, carried onto the line (POPS-4308). */
    status: z.string(),
    matchField: z.string(),
    matchedText: z.string().nullable(),
  }),
]);

export type MobilePurchaseSearchHit = z.infer<typeof MobilePurchaseSearchHitSchema>;

export const MobilePurchaseSearchResponseSchema = z.object({
  hits: z.array(MobilePurchaseSearchHitSchema),
});

export type MobilePurchaseSearchResponse = z.infer<typeof MobilePurchaseSearchResponseSchema>;

/** `GET /mobile/purchases/tags`'s response: the item tag vocabulary, most-used first. */
export const MobilePurchaseTagsResponseSchema = z.object({
  tags: z.array(z.string()),
});

export type MobilePurchaseTagsResponse = z.infer<typeof MobilePurchaseTagsResponseSchema>;

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
