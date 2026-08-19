/**
 * Spend per merchant over a period, carrying the accounting split.
 *
 * This is the pillar's first aggregate read. Everything else here reads
 * rows; this folds them, and the fold is where a spend figure can quietly
 * become wrong.
 *
 * **The residual is summed, never re-derived.** Each order's split comes
 * from {@link computeAccounting} — the same call `getPurchase` makes — and
 * the roll-up adds the six figures up. Restating the split as `SUM()` in SQL
 * would be a second implementation of the identity ADR-042 exists to keep
 * singular, and the two would drift the first time a settlement role changed
 * meaning. A merchant page that recomputed it in the browser would be the
 * same failure one layer further out.
 *
 * **Why a fold is fast enough.** Three queries regardless of how many orders
 * are in scope: the orders, their charges, and the links on those charges,
 * each scoped by a join rather than by a list of ids — so there is no
 * variable-count ceiling and no N+1. The reference Amazon bundle is 748
 * orders; the arithmetic is a few thousand integer additions.
 *
 * The period predicate on the two joined queries bounds how much is read,
 * not what is counted: the fold walks orders and looks charges up by
 * purchase id, so a charge belonging to an out-of-scope order is never
 * reached even if it is fetched. Dropping the predicate would make a
 * one-month query load every charge in the database and change no figure.
 *
 * **Why the joins do not do the arithmetic.** An order with three charges
 * appears three times in the charge join, and six times once links are
 * joined too. `SUM(purchases.total_cents)` over that join reports six times
 * the order's total — the classic fan-out, and the reason the totals here
 * are accumulated per order after the rows have been re-grouped rather than
 * by the database.
 *
 * **Grouped by currency as well as merchant.** Adding an AUD order to a USD
 * one produces an integer that means nothing and looks authoritative. A
 * merchant billing in two currencies gets two rows, which is visible, rather
 * than one wrong one.
 *
 * **No limit, and no truncation.** A partial aggregate is not a partial
 * answer, it is a false one, and a consumer has no way to tell it apart from
 * a complete one. The period is the only bound.
 */
import { and, eq } from 'drizzle-orm';

import { purchaseChargeLinks, purchaseCharges, purchases } from '../schema.js';
import { computeAccounting, type PurchaseAccounting } from './accounting.js';
import { groupBy } from './group-by.js';
import {
  identifyMerchant,
  merchantLabelRank,
  merchantSortKey,
  withNewerLabel,
  type LabelledMerchant,
  type MerchantIdentity,
} from './merchant-identity.js';
import { purchaseFilterConditions, type PurchaseScopeFilter } from './purchase-reads.js';
import { tupleKey } from './tuple-key.js';

import type { SQL } from 'drizzle-orm';

import type { PurchaseChargeLinkRow, PurchaseChargeRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';

/** One merchant's spend in one currency. */
export interface MerchantSpend {
  readonly merchant: MerchantIdentity;
  readonly currency: string;
  /** Orders in scope, counted once each however many charges they carry. */
  readonly orderCount: number;
  readonly accounting: PurchaseAccounting;
}

/** Every merchant's spend in one currency, added up. */
export interface CurrencySpend {
  readonly currency: string;
  readonly orderCount: number;
  readonly accounting: PurchaseAccounting;
}

export interface MerchantSpendRollup {
  /** Currency ascending, then net spend descending — a leaderboard per currency. */
  readonly merchants: readonly MerchantSpend[];
  /**
   * One entry per currency in scope. Never one grand total: there is no such
   * number across currencies, and inventing one would be the same silent
   * falsehood the per-currency grouping exists to avoid.
   */
  readonly totals: readonly CurrencySpend[];
}

const ZERO: PurchaseAccounting = {
  totalCents: 0,
  matchedCents: 0,
  awaitingImportCents: 0,
  residualCents: 0,
  refundedCents: 0,
  netSpendCents: 0,
};

/**
 * Add two splits.
 *
 * Every figure is summed, including the two that could be re-derived. The
 * identity `total = matched + awaitingImport + residual` survives because
 * addition is linear and it holds on each addend, and `netSpend` survives
 * because it is `total − refunded`, which is additive whatever the buckets
 * are doing. Deriving the headline from `matched + awaitingImport` instead
 * would make it move every time a sweep ran. Re-deriving either figure from
 * the running sums would be a second statement of the same identity in a
 * second place.
 */
function addAccounting(a: PurchaseAccounting, b: PurchaseAccounting): PurchaseAccounting {
  return {
    totalCents: a.totalCents + b.totalCents,
    matchedCents: a.matchedCents + b.matchedCents,
    awaitingImportCents: a.awaitingImportCents + b.awaitingImportCents,
    residualCents: a.residualCents + b.residualCents,
    refundedCents: a.refundedCents + b.refundedCents,
    netSpendCents: a.netSpendCents + b.netSpendCents,
  };
}

interface MerchantBucket {
  merchant: LabelledMerchant;
  currency: string;
  orderCount: number;
  accounting: PurchaseAccounting;
}

/**
 * The charges on the orders a scope selects, and the links on those charges,
 * indexed for the fold to look up by id.
 */
function selectSettlementRows(
  db: PurchasesDb,
  scope: readonly SQL[]
): {
  chargesByPurchase: ReadonlyMap<string, readonly PurchaseChargeRow[]>;
  linksByChargeId: ReadonlyMap<string, readonly PurchaseChargeLinkRow[]>;
} {
  const chargeQuery = db
    .select({ charge: purchaseCharges })
    .from(purchaseCharges)
    .innerJoin(purchases, eq(purchases.id, purchaseCharges.purchaseId));
  const chargeRows = (scope.length > 0 ? chargeQuery.where(and(...scope)) : chargeQuery)
    .all()
    .map((row) => row.charge);

  const linkQuery = db
    .select({ link: purchaseChargeLinks })
    .from(purchaseChargeLinks)
    .innerJoin(purchaseCharges, eq(purchaseCharges.id, purchaseChargeLinks.chargeId))
    .innerJoin(purchases, eq(purchases.id, purchaseCharges.purchaseId));
  const linkRows = (scope.length > 0 ? linkQuery.where(and(...scope)) : linkQuery)
    .all()
    .map((row) => row.link);

  return {
    chargesByPurchase: groupBy(chargeRows, (row) => row.purchaseId),
    linksByChargeId: groupBy(linkRows, (row) => row.chargeId),
  };
}

/**
 * Spend per merchant and currency over the orders a filter selects.
 *
 * Orders naming no merchant are their own `unattributed` bucket rather than
 * being dropped, so the buckets always add back up to the orders in scope.
 * Silently omitting them would make the headline smaller than the spend it
 * claims to describe, which is the shape of error nobody notices.
 */
export function rollUpMerchantSpend(
  db: PurchasesDb,
  filter: PurchaseScopeFilter = {}
): MerchantSpendRollup {
  const scope = purchaseFilterConditions(filter);

  const orderQuery = db
    .select({
      id: purchases.id,
      orderedAt: purchases.orderedAt,
      currency: purchases.currency,
      totalCents: purchases.totalCents,
      merchantEntityId: purchases.merchantEntityId,
      merchantEntityName: purchases.merchantEntityName,
    })
    .from(purchases);
  const orders = (scope.length > 0 ? orderQuery.where(and(...scope)) : orderQuery).all();
  if (orders.length === 0) return { merchants: [], totals: [] };

  const { chargesByPurchase, linksByChargeId } = selectSettlementRows(db, scope);

  const buckets = new Map<string, MerchantBucket>();
  for (const order of orders) {
    const accounting = computeAccounting(
      order.totalCents,
      chargesByPurchase.get(order.id) ?? [],
      linksByChargeId
    );
    const { key: merchantKey, identity } = identifyMerchant(
      order.merchantEntityId,
      order.merchantEntityName
    );
    const merchant: LabelledMerchant = {
      identity,
      labelRank: merchantLabelRank(order.orderedAt, order.id),
    };
    const key = tupleKey(merchantKey, order.currency);

    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, { merchant, currency: order.currency, orderCount: 1, accounting });
      continue;
    }

    existing.orderCount += 1;
    existing.accounting = addAccounting(existing.accounting, accounting);
    existing.merchant = withNewerLabel(existing.merchant, merchant);
  }

  const merchants = presentBuckets(buckets);

  return { merchants, totals: totalsByCurrency(merchants) };
}

/** Drop the fold's bookkeeping fields and put the groups in display order. */
function presentBuckets(buckets: ReadonlyMap<string, MerchantBucket>): readonly MerchantSpend[] {
  return [...buckets.values()]
    .map((bucket): MerchantSpend => ({
      merchant: bucket.merchant.identity,
      currency: bucket.currency,
      orderCount: bucket.orderCount,
      accounting: bucket.accounting,
    }))
    .sort(compareMerchantSpend);
}

/**
 * Currency first, because ranking a yen figure against a dollar one by its
 * raw cents is meaningless; then net spend descending, which is the
 * leaderboard order a merchant lens renders. Name and entity break the
 * remaining ties so the same data always serialises the same way.
 */
function compareMerchantSpend(a: MerchantSpend, b: MerchantSpend): number {
  if (a.currency !== b.currency) return a.currency < b.currency ? -1 : 1;
  if (a.accounting.netSpendCents !== b.accounting.netSpendCents) {
    return b.accounting.netSpendCents - a.accounting.netSpendCents;
  }
  const aKey = merchantSortKey(a.merchant);
  const bKey = merchantSortKey(b.merchant);
  if (aKey === bKey) return 0;
  return aKey < bKey ? -1 : 1;
}

function totalsByCurrency(merchants: readonly MerchantSpend[]): readonly CurrencySpend[] {
  const byCurrency = new Map<string, { orderCount: number; accounting: PurchaseAccounting }>();
  for (const entry of merchants) {
    const running = byCurrency.get(entry.currency) ?? { orderCount: 0, accounting: ZERO };
    byCurrency.set(entry.currency, {
      orderCount: running.orderCount + entry.orderCount,
      accounting: addAccounting(running.accounting, entry.accounting),
    });
  }

  return [...byCurrency.entries()]
    .map(([currency, running]) => ({ currency, ...running }))
    .sort((a, b) => (a.currency < b.currency ? -1 : 1));
}
