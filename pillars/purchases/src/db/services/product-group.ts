/**
 * One product group: what it accumulates as lines arrive, and what it
 * presents once they all have.
 *
 * Split from the fold beside it because the two fail differently. The fold
 * decides which groups exist and how they are ordered; this decides what one
 * group says about itself, which is where a figure quietly stops meaning
 * what its name claims.
 *
 * **Ordering within a group is by the instant, not the string.** Every
 * "first" and "last" here — the two dates, the label the group wears, the
 * merchant it is attributed to, the two ends of the unit-price history — is
 * decided through {@link isNewer}, so an order stamped
 * `2026-01-02T00:00:00+10:00` correctly precedes one stamped
 * `2026-01-01T20:00:00Z`. Sorting those two as text puts them the wrong way
 * round, and a row whose endpoints disagree with its own cadence is worse
 * than either answer alone.
 *
 * A `product` group is the one basis that can hold several printed wordings,
 * so two of its fields are folded rather than read off a line: the name and
 * the source travel together off the newest line, and `confirmed` is true
 * only where every wording that reached the group was asserted.
 */
import { landedCostCents } from './accounting.js';
import { summariseIntervals } from './interval-stats.js';
import {
  identifyMerchant,
  merchantLabelRank,
  merchantSortKey,
  withNewerLabel,
  type LabelledMerchant,
  type MerchantIdentity,
} from './merchant-identity.js';
import { isNewer, isOlder, orderRank, type OrderRank } from './order-rank.js';

import type { ProductIdentity } from './product-identity.js';
import type { ScopedLine } from './product-leaderboard-lines.js';

/**
 * How often a product comes back.
 *
 * A union rather than four nullable numbers, because a product bought once
 * has no gap between purchases and every number that could stand in for one
 * reads as a claim: a zero says "bought again immediately" and a null
 * invites a consumer to render an empty cadence beside a real one.
 *
 * Measured between **distinct orders**, not lines. Two lines of the same
 * product in one order are one purchase, and counting them twice would
 * report a cadence of zero for a shopper who bought two bags of the same
 * coffee at once.
 */
export type ProductCadence =
  | {
      /**
       * Fewer than two of this product's orders carry an instant to measure
       * between, so no gap exists. Usually one order; also a group whose
       * other orders carry a `ordered_at` that does not parse, which is why
       * this can appear beside an `orderCount` above 1 rather than
       * asserting a gap over a timestamp nothing could read.
       */
      readonly basis: 'single-purchase';
    }
  | {
      readonly basis: 'intervals';
      /**
       * The middle gap between consecutive purchases. The headline: a
       * bursty history's mean describes a rhythm that never happened, and
       * the median does not.
       */
      readonly medianIntervalSeconds: number;
      /** The arithmetic mean. Its distance from the median is how bursty the history is. */
      readonly meanIntervalSeconds: number;
      readonly shortestIntervalSeconds: number;
      readonly longestIntervalSeconds: number;
    };

/**
 * What one unit of this product has cost, across the group.
 *
 * `purchase_items.unit_price_cents` — what the merchant charged for one —
 * and deliberately **not** the landed cost. Allocated shipping and
 * adjustment are shares of an order-level figure spread over that order's
 * lines, so the same product bought alone and bought inside a twenty-line
 * order carries wildly different allocations; a per-unit series built on
 * landed cost moves with the shape of the basket rather than with the
 * price, and reports a drift that never happened.
 *
 * The four figures are observations, not a verdict. No percentage is
 * returned: `first` → `last` is the drift, `min` and `max` say whether
 * those two ends are representative of it, and a single derived number
 * would hide the case where they are not.
 *
 * The three counts beside them are what says whether the observations are
 * comparable at all, and each is a fact off a column rather than an
 * inference.
 */
export interface ProductUnitPrice {
  /** The earliest line's unit price, by the order instant. */
  readonly firstCents: number;
  /** The latest line's unit price, by the order instant. */
  readonly lastCents: number;
  readonly minCents: number;
  readonly maxCents: number;
  /** Lines the merchant marked as sold at a promotional price. */
  readonly promotionalLineCount: number;
  /** Lines the merchant marked as sold at its ordinary price. */
  readonly ordinaryLineCount: number;
  /**
   * Lines whose merchant said nothing either way, which is every line from
   * every source but the Woolworths receipt. Reported rather than folded
   * into the ordinary count, because "not marked as a special" and "nobody
   * said" are what separate a real price series from an unknown one.
   */
  readonly unstatedPromotionLineCount: number;
  /**
   * Lines priced by measure — `0.202 kg NET @ $2.90/kg`. Such a line has a
   * quantity of 1 and a unit price equal to what that weight cost, so its
   * unit price is a function of what went on the scale. Where this is
   * non-zero the figures above are partly weights, and a drift read off
   * them is a change in how much was bought rather than in what it cost.
   */
  readonly measuredLineCount: number;
}

/** One product's history in one currency. */
export interface ProductPurchases {
  readonly product: ProductIdentity;
  readonly currency: string;
  /** Distinct orders this product appears in — the "across N orders" figure. */
  readonly orderCount: number;
  /** Lines. Higher than {@link orderCount} when one order lists the product twice. */
  readonly lineCount: number;
  /** Units, summing each line's quantity. */
  readonly unitCount: number;
  readonly firstPurchasedAt: string;
  readonly lastPurchasedAt: string;
  /** Summed `lineTotal + allocatedShipping + allocatedAdjustment` over the lines. */
  readonly landedCostCents: number;
  /**
   * Settled refunds recorded against these lines. Gross of any refund
   * recorded at the *order* grain, which no adapter attributes to a line —
   * the Amazon disbursement feed names an order and never a line — so this
   * reads 0 for every line the shipped adapters write. Returned rather than
   * folded into the landed cost so a consumer cannot mistake one for the
   * other.
   */
  readonly refundedCents: number;
  /** How often it comes back. See {@link ProductCadence}. */
  readonly cadence: ProductCadence;
  /** What one of it has cost each time. See {@link ProductUnitPrice}. */
  readonly unitPrice: ProductUnitPrice;
  /**
   * Every merchant this product was bought from, in this currency, and the
   * scope of the group. More than one in two cases and no others: the source
   * is a single merchant's feed that names its own stores, as the Woolworths
   * export does; or a human pointed wordings from several merchants at one
   * dictionary product. Nothing derived ever widens this on its own.
   */
  readonly merchants: readonly MerchantIdentity[];
}

/** Where a line sits in its group's history: its order's instant, the line id breaking ties. */
export function rankLine(line: ScopedLine): OrderRank {
  return orderRank(line.orderedAt, line.itemId);
}

export interface RankedLine {
  readonly rank: OrderRank;
  readonly line: ScopedLine;
}

export interface ProductBucket {
  identity: ProductIdentity;
  currency: string;
  /**
   * Distinct order id to the instant it was placed. The keys are the
   * `orderCount`; the values are the cadence's raw material, and are NaN
   * for an order whose `ordered_at` does not parse — which is why the
   * count and the cadence are taken from opposite halves of one map rather
   * than from a filtered copy that would quietly under-count the orders.
   */
  orders: Map<string, number>;
  lineCount: number;
  unitCount: number;
  /** The ends of the group's history: both dates, the label, and both unit prices. */
  earliest: RankedLine;
  latest: RankedLine;
  minUnitPriceCents: number;
  maxUnitPriceCents: number;
  promotionalLineCount: number;
  ordinaryLineCount: number;
  unstatedPromotionLineCount: number;
  measuredLineCount: number;
  landedCostCents: number;
  refundedCents: number;
  merchants: Map<string, LabelledMerchant>;
}

export function startBucket(ranked: RankedLine, identity: ProductIdentity): ProductBucket {
  const { line } = ranked;
  return {
    identity,
    currency: line.currency,
    orders: new Map(),
    lineCount: 0,
    unitCount: 0,
    earliest: ranked,
    latest: ranked,
    minUnitPriceCents: line.unitPriceCents,
    maxUnitPriceCents: line.unitPriceCents,
    promotionalLineCount: 0,
    ordinaryLineCount: 0,
    unstatedPromotionLineCount: 0,
    measuredLineCount: 0,
    landedCostCents: 0,
    refundedCents: 0,
    merchants: new Map(),
  };
}

/**
 * Fold one line in, whether or not it opened the bucket.
 *
 * Every counting figure is accumulated here and none is seeded in
 * {@link startBucket}, so the first line into a group takes exactly the same
 * path as the tenth — the shape of bug where an opening line is counted once
 * in one figure and twice in another cannot arise. The four figures
 * {@link startBucket} does seed are the ones that choose rather than count —
 * both ends and both price extremes — and folding the opening line into them
 * a second time here reaches the same answer.
 */
export function accumulate(
  bucket: ProductBucket,
  ranked: RankedLine,
  identity: ProductIdentity,
  measured: boolean
): void {
  const { line, rank } = ranked;

  foldConfirmation(bucket, identity);

  bucket.orders.set(line.purchaseId, rank.instant);

  bucket.lineCount += 1;
  bucket.unitCount += line.quantity;
  bucket.landedCostCents += landedCostCents(line);
  bucket.refundedCents += line.refundedCents;

  bucket.minUnitPriceCents = Math.min(bucket.minUnitPriceCents, line.unitPriceCents);
  bucket.maxUnitPriceCents = Math.max(bucket.maxUnitPriceCents, line.unitPriceCents);
  if (line.promotionalPrice === null) bucket.unstatedPromotionLineCount += 1;
  else if (line.promotionalPrice) bucket.promotionalLineCount += 1;
  else bucket.ordinaryLineCount += 1;
  if (measured) bucket.measuredLineCount += 1;

  if (isNewer(rank, bucket.latest.rank)) bucket.latest = ranked;
  if (isOlder(rank, bucket.earliest.rank)) bucket.earliest = ranked;
}

/**
 * A group is asserted only where every wording that reached it was.
 *
 * The alternative — wearing whichever line's marker opened the bucket —
 * makes the badge depend on read order, and half the time reports a row as
 * asserted while some of its lines are in it on a pass's proposal. Only ever
 * moves true to false, so the answer does not depend on the order the lines
 * arrive in either.
 */
function foldConfirmation(bucket: ProductBucket, identity: ProductIdentity): void {
  if (bucket.identity.basis !== 'product' || identity.basis !== 'product') return;
  if (identity.confirmed || !bucket.identity.confirmed) return;
  bucket.identity = { ...bucket.identity, confirmed: false };
}

export function noteMerchant(bucket: ProductBucket, line: ScopedLine): void {
  const { key, identity } = identifyMerchant(line.merchantEntityId, line.merchantEntityName);
  const candidate: LabelledMerchant = {
    identity,
    labelRank: merchantLabelRank(line.orderedAt, line.purchaseId),
  };
  const existing = bucket.merchants.get(key);
  bucket.merchants.set(
    key,
    existing === undefined ? candidate : withNewerLabel(existing, candidate)
  );
}

/**
 * Wear the latest line's printed name, and the source that printed it.
 *
 * Only the label moves, never the key: a `sku` group is keyed on the sku, a
 * `name` group on the normalised name and a `product` group on the product
 * id, all of which survive a merchant rewording what it prints — and a
 * `product` group keeps the product's own `label` beside the printed name it
 * is wearing, so a name a human wrote is never overwritten by a till's. An
 * `unidentified` group holds one line and has nothing to choose between.
 *
 * The source travels with the name because it is constant within every other
 * basis's key, but a `product` group may hold lines from several, and a name
 * from one line beside a source from another describes a line that does not
 * exist.
 */
function label(bucket: ProductBucket): ProductIdentity {
  if (bucket.identity.basis === 'unidentified') return bucket.identity;
  const { name, source } = bucket.latest.line;
  return { ...bucket.identity, name, source };
}

export function present(bucket: ProductBucket): ProductPurchases {
  const intervals = summariseIntervals(
    [...bucket.orders.values()].filter((instant) => Number.isFinite(instant))
  );

  return {
    product: label(bucket),
    currency: bucket.currency,
    orderCount: bucket.orders.size,
    lineCount: bucket.lineCount,
    unitCount: bucket.unitCount,
    firstPurchasedAt: bucket.earliest.line.orderedAt,
    lastPurchasedAt: bucket.latest.line.orderedAt,
    landedCostCents: bucket.landedCostCents,
    refundedCents: bucket.refundedCents,
    cadence:
      intervals === null
        ? { basis: 'single-purchase' }
        : {
            basis: 'intervals',
            medianIntervalSeconds: intervals.medianSeconds,
            meanIntervalSeconds: intervals.meanSeconds,
            shortestIntervalSeconds: intervals.shortestSeconds,
            longestIntervalSeconds: intervals.longestSeconds,
          },
    unitPrice: {
      firstCents: bucket.earliest.line.unitPriceCents,
      lastCents: bucket.latest.line.unitPriceCents,
      minCents: bucket.minUnitPriceCents,
      maxCents: bucket.maxUnitPriceCents,
      promotionalLineCount: bucket.promotionalLineCount,
      ordinaryLineCount: bucket.ordinaryLineCount,
      unstatedPromotionLineCount: bucket.unstatedPromotionLineCount,
      measuredLineCount: bucket.measuredLineCount,
    },
    merchants: [...bucket.merchants.values()]
      .map((merchant) => merchant.identity)
      .sort((a, b) => (merchantSortKey(a) < merchantSortKey(b) ? -1 : 1)),
  };
}
