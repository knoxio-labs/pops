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
import { purchaseFilterConditions, type PurchaseScopeFilter } from './purchase-reads.js';

import type { MerchantResolution } from '../../contract/constants.js';
import type { PurchasesDb } from './internal.js';

/**
 * Who the spend is attributed to, and how confidently.
 *
 * Three-way because the pillar has two different things called a merchant
 * and they are not interchangeable. `merchantEntityId` is operative — a
 * resolved `contacts` entity. `merchantEntityName` is only a label, and no
 * export adapter sets an id at all, so today an Amazon roll-up is grouped on
 * the string `Amazon`. Presenting that as the same kind of fact as a
 * resolved entity would be reporting a string match as an identity: two
 * merchants sharing a label share a row, and renaming one splits its
 * history.
 */
export interface MerchantIdentity {
  /** The resolved `contacts` entity, when one was ever attached. */
  readonly entityId: string | null;
  /** The merchant's label. The grouping key itself when `resolution` is `name`. */
  readonly name: string | null;
  readonly resolution: MerchantResolution;
}

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
  entityId: string | null;
  name: string | null;
  resolution: MerchantResolution;
  currency: string;
  orderCount: number;
  accounting: PurchaseAccounting;
  /** `orderedAt` and id of the order whose label this bucket is wearing. */
  labelRank: string;
}

/**
 * The bucket an order belongs to, and how that bucket is identified.
 *
 * The key is a JSON tuple rather than a delimited string so a merchant whose
 * *name* happens to equal another merchant's *entity id* cannot land in the
 * same bucket, and so no delimiter has to be assumed absent from a merchant
 * name.
 */
function identify(
  entityId: string | null,
  name: string | null,
  currency: string
): { key: string; identity: MerchantIdentity } {
  if (entityId !== null) {
    return {
      key: JSON.stringify(['entity', entityId, currency]),
      identity: { entityId, name, resolution: 'entity' },
    };
  }
  if (name !== null) {
    return {
      key: JSON.stringify(['name', name, currency]),
      identity: { entityId: null, name, resolution: 'name' },
    };
  }
  return {
    key: JSON.stringify(['unattributed', null, currency]),
    identity: { entityId: null, name: null, resolution: 'unattributed' },
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

  const orders = db
    .select({
      id: purchases.id,
      orderedAt: purchases.orderedAt,
      currency: purchases.currency,
      totalCents: purchases.totalCents,
      merchantEntityId: purchases.merchantEntityId,
      merchantEntityName: purchases.merchantEntityName,
    })
    .from(purchases)
    .where(and(...scope))
    .all();
  if (orders.length === 0) return { merchants: [], totals: [] };

  const chargeRows = db
    .select({ charge: purchaseCharges })
    .from(purchaseCharges)
    .innerJoin(purchases, eq(purchases.id, purchaseCharges.purchaseId))
    .where(and(...scope))
    .all()
    .map((row) => row.charge);

  const linkRows = db
    .select({ link: purchaseChargeLinks })
    .from(purchaseChargeLinks)
    .innerJoin(purchaseCharges, eq(purchaseCharges.id, purchaseChargeLinks.chargeId))
    .innerJoin(purchases, eq(purchases.id, purchaseCharges.purchaseId))
    .where(and(...scope))
    .all()
    .map((row) => row.link);

  const chargesByPurchase = groupBy(chargeRows, (row) => row.purchaseId);
  const linksByChargeId = groupBy(linkRows, (row) => row.chargeId);

  const buckets = new Map<string, MerchantBucket>();
  for (const order of orders) {
    const accounting = computeAccounting(
      order.totalCents,
      chargesByPurchase.get(order.id) ?? [],
      linksByChargeId
    );
    const { key, identity } = identify(
      order.merchantEntityId,
      order.merchantEntityName,
      order.currency
    );
    const labelRank = JSON.stringify([order.orderedAt, order.id]);

    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, {
        ...identity,
        currency: order.currency,
        orderCount: 1,
        accounting,
        labelRank,
      });
      continue;
    }

    existing.orderCount += 1;
    existing.accounting = addAccounting(existing.accounting, accounting);
    // An entity-keyed bucket can span orders written either side of a rename
    // in `contacts`. The label is only a label, so the newest order's wins —
    // deterministically, since the id breaks a same-instant tie.
    if (labelRank > existing.labelRank) {
      existing.name = identity.name;
      existing.labelRank = labelRank;
    }
  }

  const merchants = [...buckets.values()]
    .map((bucket): MerchantSpend => ({
      merchant: {
        entityId: bucket.entityId,
        name: bucket.name,
        resolution: bucket.resolution,
      },
      currency: bucket.currency,
      orderCount: bucket.orderCount,
      accounting: bucket.accounting,
    }))
    .sort(compareMerchantSpend);

  return { merchants, totals: totalsByCurrency(merchants) };
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
  const aKey = JSON.stringify([a.merchant.name, a.merchant.entityId]);
  const bKey = JSON.stringify([b.merchant.name, b.merchant.entityId]);
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
