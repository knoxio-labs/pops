/**
 * Repeat purchases at the **product** grain: the same thing bought across N
 * orders, what it has cost, how often it comes back, and what it has cost
 * per unit each time. What one group holds and reports is
 * {@link ProductBucket}, beside this.
 *
 * The merchant roll-up beside this one is at the order grain and cannot
 * answer this — an order total says nothing about which of its lines keeps
 * coming back.
 *
 * **The identity is the whole problem.** Grouping is {@link identifyProduct}:
 * the merchant's sku where one is stated, a learned dictionary entry where
 * the printed wording has one, the normalised printed name where it does
 * not, and the line's own id where there is neither. Only the sku is an
 * identity a source asserted, and exactly one shipped adapter writes one. So
 * a name-keyed group is a proposal — two products whose names normalise alike
 * merge, one product printed two ways stays split — and a dictionary group is
 * only as strong as the evidence behind its entry. Every row says which basis
 * formed it rather than presenting them all at one confidence. {@link
 * ProductIdentityCoverage} states the same thing over the whole scope, so a
 * consumer can see how much of the answer rests on a proposal before it
 * renders a single row.
 *
 * **A group never spans merchants a source did not put together.** Under a
 * source that covers many shops — every uploaded receipt shares one — the
 * key is confined to the order's merchant, so two shops printing the same
 * abbreviation are two rows rather than one row summing both. Under a
 * source that is one merchant's own feed the key is the source, which is
 * what keeps a chain's product from splitting per store. A dictionary group
 * is the one thing that can reach across that boundary, and only because
 * somebody pointed two scoped wordings at one product on purpose.
 *
 * **Why the join does not do the arithmetic.** One row per line, joined only
 * to its order. Nothing here touches charges or links, which is what makes
 * "how many orders" a count of distinct order ids rather than a number that
 * multiplies by however many charges settled them — the fan-out the merchant
 * roll-up has to fold around. Landed cost comes from `landedCostCents` in
 * `accounting.ts`, the same call the order read makes, rather than being
 * restated as `lineTotal + shipping + adjustment` in SQL where it could
 * drift from it.
 *
 * **Grouped by currency as well as product.** Adding an AUD line to a USD one
 * produces an integer that means nothing and looks authoritative.
 *
 * **No limit and no truncation.** `minOrderCount` is not a page cap: it is
 * the N in "bought across N orders", stated by the caller and echoed back, so
 * a withheld group is withheld by a criterion the response names. A `limit`
 * would instead drop rows for a reason nothing in the response records.
 */
import { countCoverage, type CoverageTally } from './product-coverage.js';
import { loadProductDictionary } from './product-dictionary.js';
import {
  accumulate,
  noteMerchant,
  present,
  rankLine,
  startBucket,
  type ProductBucket,
  type ProductPurchases,
  type RankedLine,
} from './product-group.js';
import { identifyProduct } from './product-identity.js';
import { selectMeasuredItemIds, selectScopedLines } from './product-leaderboard-lines.js';
import { tupleKey } from './tuple-key.js';

import type { PurchasesDb } from './internal.js';
import type { PurchaseScopeFilter } from './purchase-reads.js';

export type { ProductCadence, ProductPurchases, ProductUnitPrice } from './product-group.js';

export interface ProductLeaderboardFilter extends PurchaseScopeFilter {
  /**
   * Withhold products bought in fewer than this many distinct orders.
   * Defaults to 1, which withholds nothing.
   */
  readonly minOrderCount?: number;
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
  /** Grouped through a dictionary entry a human asserted. */
  readonly confirmedProductLines: number;
  /** Grouped through a dictionary entry a pass proposed and nobody has confirmed. */
  readonly proposedProductLines: number;
  /** Grouped on a normalised printed name — a proposal, not an assertion. */
  readonly nameKeyedLines: number;
  /** Grouped with nothing: no sku, and no name that normalises to anything. */
  readonly unidentifiedLines: number;
  /**
   * Groups the scope holds, including any `minOrderCount` withheld — one per
   * product *and currency*, so a sku bought in two currencies counts twice,
   * for the reason it is two rows.
   */
  readonly productCount: number;
}

export interface ProductLeaderboard {
  /** Currency ascending, then orders descending, then landed cost descending. */
  readonly products: readonly ProductPurchases[];
  readonly coverage: ProductIdentityCoverage;
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
  const measuredItemIds = selectMeasuredItemIds(db, filter);
  const dictionary = loadProductDictionary(db);

  const buckets = new Map<string, ProductBucket>();
  const coverage: CoverageTally = {
    skuKeyedLines: 0,
    confirmedProductLines: 0,
    proposedProductLines: 0,
    nameKeyedLines: 0,
    unidentifiedLines: 0,
  };

  for (const line of lines) {
    const { key: productKey, identity } = identifyProduct(
      {
        id: line.itemId,
        source: line.source,
        sku: line.sku,
        skuScheme: line.skuScheme,
        name: line.name,
        merchantEntityId: line.merchantEntityId,
        merchantEntityName: line.merchantEntityName,
      },
      dictionary
    );
    countCoverage(coverage, identity);

    const ranked: RankedLine = { rank: rankLine(line), line };
    const key = tupleKey(productKey, line.currency);
    const existing = buckets.get(key);
    const bucket = existing ?? startBucket(ranked, identity);
    if (existing === undefined) buckets.set(key, bucket);
    accumulate(bucket, ranked, identity, measuredItemIds.has(line.itemId));
    noteMerchant(bucket, line);
  }

  const minOrderCount = filter.minOrderCount ?? 1;
  const products = [...buckets.entries()]
    .filter(([, bucket]) => bucket.orders.size >= minOrderCount)
    .map(([key, bucket]) => ({ key, entry: present(bucket) }))
    .sort(compareEntries)
    .map(({ entry }) => entry);

  return {
    products,
    coverage: { ...coverage, lineCount: lines.length, productCount: buckets.size },
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
