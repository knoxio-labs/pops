/**
 * Repeat purchases at the **product** grain: the same thing bought across N
 * orders, what it has cost, and when it was last bought.
 *
 * The merchant roll-up beside this one is at the order grain and cannot
 * answer this — an order total says nothing about which of its lines keeps
 * coming back.
 *
 * **The identity is the whole problem, and it is only partly solved.**
 * Grouping is {@link identifyProduct}: the merchant's sku where one is
 * stated, the normalised printed name where none is, and the line's own id
 * where there is neither. Only the first is an identity a source asserted,
 * and exactly one shipped adapter writes one. So a name-keyed group is a
 * proposal — two products whose names normalise alike merge, one product
 * printed two ways stays split — and every row says which basis formed it
 * rather than presenting all three at one confidence. {@link
 * ProductIdentityCoverage} states the same thing over the whole scope, so a
 * consumer can see how much of the answer rests on printed names before it
 * renders a single row.
 *
 * **Why the join does not do the arithmetic.** One row per line, joined only
 * to its order. Nothing here touches charges or links, which is what makes
 * "how many orders" a count of distinct order ids rather than a number that
 * multiplies by however many charges settled them — the fan-out the merchant
 * roll-up has to fold around. Landed cost comes from
 * {@link landedCostCents}, the same call the order read makes, rather than
 * being restated as `lineTotal + shipping + adjustment` in SQL where it
 * could drift from it.
 *
 * **Grouped by currency as well as product.** Adding an AUD line to a USD one
 * produces an integer that means nothing and looks authoritative.
 *
 * **No limit and no truncation.** `minOrderCount` is not a page cap: it is
 * the N in "bought across N orders", stated by the caller and echoed back, so
 * a withheld group is withheld by a criterion the response names. A `limit`
 * would instead drop rows for a reason nothing in the response records.
 */
import { landedCostCents } from './accounting.js';
import {
  identifyMerchant,
  merchantLabelRank,
  merchantSortKey,
  withNewerLabel,
  type LabelledMerchant,
  type MerchantIdentity,
} from './merchant-identity.js';
import { identifyProduct, type ProductIdentity } from './product-identity.js';
import { selectScopedLines, type ScopedLine } from './product-leaderboard-lines.js';
import { tupleKey } from './tuple-key.js';

import type { PurchasesDb } from './internal.js';
import type { PurchaseScopeFilter } from './purchase-reads.js';

export interface ProductLeaderboardFilter extends PurchaseScopeFilter {
  /**
   * Withhold products bought in fewer than this many distinct orders.
   * Defaults to 1, which withholds nothing.
   */
  readonly minOrderCount?: number;
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
  /**
   * Every merchant this product was bought from, in this currency. Usually
   * one; more than one where a source covers many merchants, as receipt
   * ingest does.
   */
  readonly merchants: readonly MerchantIdentity[];
}

/**
 * How much of the scope the grouping could actually identify.
 *
 * Over every line in scope, before `minOrderCount` withholds anything, so
 * the denominator is the whole answer rather than the part that survived a
 * filter. A leaderboard whose lines are mostly name-keyed is a weaker claim
 * than one whose lines are mostly sku-keyed, and nothing else in the
 * response says which one a consumer is holding.
 */
export interface ProductIdentityCoverage {
  readonly lineCount: number;
  /** Grouped on an identifier the merchant stated. */
  readonly skuKeyedLines: number;
  /** Grouped on a normalised printed name — a proposal, not an assertion. */
  readonly nameKeyedLines: number;
  /** Grouped with nothing: no sku, and no name that normalises to anything. */
  readonly unidentifiedLines: number;
  /** Products the scope holds, including any `minOrderCount` withheld. */
  readonly productCount: number;
}

export interface ProductLeaderboard {
  /** Currency ascending, then orders descending, then landed cost descending. */
  readonly products: readonly ProductPurchases[];
  readonly coverage: ProductIdentityCoverage;
}

interface ProductBucket {
  identity: ProductIdentity;
  /** Rank of the line whose printed name this bucket is wearing. */
  labelRank: string;
  currency: string;
  orderIds: Set<string>;
  lineCount: number;
  unitCount: number;
  firstPurchasedAt: string;
  lastPurchasedAt: string;
  landedCostCents: number;
  refundedCents: number;
  merchants: Map<string, LabelledMerchant>;
}

function startBucket(line: ScopedLine, identity: ProductIdentity, rank: string): ProductBucket {
  return {
    identity,
    labelRank: rank,
    currency: line.currency,
    orderIds: new Set([line.purchaseId]),
    lineCount: 1,
    unitCount: line.quantity,
    firstPurchasedAt: line.orderedAt,
    lastPurchasedAt: line.orderedAt,
    landedCostCents: landedCostCents(line),
    refundedCents: line.refundedCents,
    merchants: new Map(),
  };
}

function accumulate(bucket: ProductBucket, line: ScopedLine, rank: string): void {
  bucket.orderIds.add(line.purchaseId);
  bucket.lineCount += 1;
  bucket.unitCount += line.quantity;
  bucket.landedCostCents += landedCostCents(line);
  bucket.refundedCents += line.refundedCents;
  if (line.orderedAt < bucket.firstPurchasedAt) bucket.firstPurchasedAt = line.orderedAt;
  if (line.orderedAt > bucket.lastPurchasedAt) bucket.lastPurchasedAt = line.orderedAt;
  relabel(bucket, line, rank);
}

/**
 * Wear the newest line's printed name.
 *
 * Only the label moves, never the key: a `sku` group is keyed on the sku and
 * a `name` group on the normalised name, both of which survive a merchant
 * rewording what it prints. Newest-wins rather than first-seen because
 * "first" is whichever row the query happened to return first, which would
 * make a rendered name depend on read order. An `unidentified` group holds
 * one line and has nothing to choose between.
 */
function relabel(bucket: ProductBucket, line: ScopedLine, rank: string): void {
  if (bucket.identity.basis === 'unidentified' || rank <= bucket.labelRank) return;
  bucket.identity = { ...bucket.identity, name: line.name };
  bucket.labelRank = rank;
}

function noteMerchant(bucket: ProductBucket, line: ScopedLine): void {
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
 * Repeat purchases per product identity over the orders a filter selects.
 *
 * Lines whose product cannot be identified are their own single-line groups
 * rather than being dropped, so the coverage figures describe every line in
 * scope. Dropping them would make the identified share of the answer look
 * larger than it is, which is the one error this route must not make.
 */
export function rankProductPurchases(
  db: PurchasesDb,
  filter: ProductLeaderboardFilter = {}
): ProductLeaderboard {
  const lines = selectScopedLines(db, filter);

  const buckets = new Map<string, ProductBucket>();
  const coverage = { skuKeyedLines: 0, nameKeyedLines: 0, unidentifiedLines: 0 };

  for (const line of lines) {
    const { key: productKey, identity } = identifyProduct({
      id: line.itemId,
      source: line.source,
      sku: line.sku,
      name: line.name,
    });
    if (identity.basis === 'sku') coverage.skuKeyedLines += 1;
    else if (identity.basis === 'name') coverage.nameKeyedLines += 1;
    else coverage.unidentifiedLines += 1;

    const rank = tupleKey(line.orderedAt, line.itemId);
    const key = tupleKey(productKey, line.currency);
    const existing = buckets.get(key);
    const bucket = existing ?? startBucket(line, identity, rank);
    if (existing !== undefined) accumulate(bucket, line, rank);
    else buckets.set(key, bucket);
    noteMerchant(bucket, line);
  }

  const minOrderCount = filter.minOrderCount ?? 1;
  const products = [...buckets.entries()]
    .filter(([, bucket]) => bucket.orderIds.size >= minOrderCount)
    .map(([key, bucket]) => ({ key, entry: present(bucket) }))
    .sort(compareEntries)
    .map(({ entry }) => entry);

  return {
    products,
    coverage: { ...coverage, lineCount: lines.length, productCount: buckets.size },
  };
}

function present(bucket: ProductBucket): ProductPurchases {
  return {
    product: bucket.identity,
    currency: bucket.currency,
    orderCount: bucket.orderIds.size,
    lineCount: bucket.lineCount,
    unitCount: bucket.unitCount,
    firstPurchasedAt: bucket.firstPurchasedAt,
    lastPurchasedAt: bucket.lastPurchasedAt,
    landedCostCents: bucket.landedCostCents,
    refundedCents: bucket.refundedCents,
    merchants: [...bucket.merchants.values()]
      .map((merchant) => merchant.identity)
      .sort((a, b) => (merchantSortKey(a) < merchantSortKey(b) ? -1 : 1)),
  };
}

/**
 * Currency first, because ranking a yen figure against a dollar one by its
 * raw cents is meaningless; then how many orders it took, which is what this
 * route is a leaderboard of; then landed cost, so the more expensive of two
 * equally-repeated products leads. The grouping key breaks the remaining
 * ties, so the same data always serialises the same way.
 */
function compareEntries(
  a: { key: string; entry: ProductPurchases },
  b: { key: string; entry: ProductPurchases }
): number {
  if (a.entry.currency !== b.entry.currency) return a.entry.currency < b.entry.currency ? -1 : 1;
  if (a.entry.orderCount !== b.entry.orderCount) return b.entry.orderCount - a.entry.orderCount;
  if (a.entry.landedCostCents !== b.entry.landedCostCents) {
    return b.entry.landedCostCents - a.entry.landedCostCents;
  }
  if (a.key === b.key) return 0;
  return a.key < b.key ? -1 : 1;
}
