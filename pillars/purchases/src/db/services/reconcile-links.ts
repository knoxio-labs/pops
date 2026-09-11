/**
 * The link table read backwards: transaction → the orders it paid for.
 *
 * Every other read here starts from an order. This one starts from a
 * `pops://finance/transaction/<id>` and is the only way to answer "what did
 * this charge on my statement buy", which is the question ADR-042 exists
 * for and the one the forward reads cannot serve — a consumer holding a
 * transaction would otherwise have to page every order and filter client
 * side, which is fine on a demo database and not on a year of history.
 *
 * It reads the link table directly rather than the reconcile queue, and the
 * distinction is the whole point: the queue returns charges awaiting a
 * decision, so a confirmed link is absent from it by design and an
 * auto-link source never enters it at all. Both are established links, and
 * both are exactly what a finance view is asking about.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { purchaseChargeLinks, purchaseCharges, purchases } from '../schema.js';

import type { PurchaseChargeLinkRow, PurchaseChargeRow, PurchaseRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';

export interface LinkedCharge {
  readonly charge: PurchaseChargeRow;
  readonly link: PurchaseChargeLinkRow;
}

export interface LinkedPurchase {
  readonly purchase: PurchaseRow;
  readonly charges: readonly LinkedCharge[];
  /** `Σ charges[].link.amountCents` — this order's share of the transaction. */
  readonly linkedCents: number;
}

export interface TransactionLinksFilter {
  readonly limit?: number;
  readonly offset?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/** One row per (charge, its order), grouped into a {@link LinkedPurchase} per order. */
function groupByPurchase(
  chargeRows: readonly { charge: PurchaseChargeRow; purchase: PurchaseRow }[],
  linksByCharge: ReadonlyMap<string, PurchaseChargeLinkRow>
): LinkedPurchase[] {
  const byPurchase = new Map<string, { purchase: PurchaseRow; charges: LinkedCharge[] }>();
  for (const row of chargeRows) {
    const link = linksByCharge.get(row.charge.id);
    // A link whose charge is gone cannot exist — the foreign key cascades,
    // and both reads this is called from run in one transaction, so a
    // concurrent tear-down cannot land between them — so this narrows the
    // type rather than handling a real case.
    if (link === undefined) continue;

    const linked: LinkedCharge = { charge: row.charge, link };
    const bucket = byPurchase.get(row.purchase.id);
    if (bucket === undefined) {
      byPurchase.set(row.purchase.id, { purchase: row.purchase, charges: [linked] });
    } else {
      bucket.charges.push(linked);
    }
  }

  return [...byPurchase.values()].map((entry) => ({
    purchase: entry.purchase,
    charges: entry.charges,
    linkedCents: entry.charges.reduce((sum, charge) => sum + charge.link.amountCents, 0),
  }));
}

/**
 * Every order with at least one charge linked to `transactionUri`, newest
 * order first.
 *
 * Returns a list rather than a single order because one transaction
 * settling several orders is a modelled case, not an anomaly: a combined
 * settlement is a phase of the matching ladder, and collapsing its result to
 * "the" purchase would silently drop the rest.
 */
export function listPurchasesForTransaction(
  db: PurchasesDb,
  transactionUri: string,
  filter: TransactionLinksFilter = {}
): readonly LinkedPurchase[] {
  const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(filter.offset ?? 0, 0);

  // Both reads run in one transaction so they see the same snapshot: this
  // pillar is multi-process (the ingest CLI and the cron sweep write the
  // same database file), and a link tear-down plus its cascaded charge
  // delete landing between two independent reads would otherwise produce a
  // combination of link and charge rows that never coexisted, silently
  // understating `linkedCents` rather than erroring.
  return db.transaction((tx) => {
    const linkRows = tx
      .select()
      .from(purchaseChargeLinks)
      .where(eq(purchaseChargeLinks.transactionUri, transactionUri))
      .all();
    if (linkRows.length === 0) return [];

    const linksByCharge = new Map(linkRows.map((link) => [link.chargeId, link]));

    // Paging is over orders, not charges — the page a caller asks for is
    // "the Nth order this transaction paid for", and a combined settlement's
    // charges belong together on one page. Selecting the page of purchase
    // ids first, ahead of the join below, is what keeps that true: paging
    // the joined charge rows directly could split one order's charges
    // across two pages.
    const pageOfPurchaseIds = tx
      .selectDistinct({ purchaseId: purchases.id })
      .from(purchaseCharges)
      .innerJoin(purchases, eq(purchaseCharges.purchaseId, purchases.id))
      .where(inArray(purchaseCharges.id, [...linksByCharge.keys()]))
      .orderBy(desc(purchases.orderedAt), asc(purchases.id))
      .limit(limit)
      .offset(offset)
      .all()
      .map((row) => row.purchaseId);
    if (pageOfPurchaseIds.length === 0) return [];

    // Charges and their orders in one join rather than two round trips,
    // ordered here so no caller has to re-sort: ids are random UUIDs and every
    // row of one ingest shares a `createdAt` to the second, so without an
    // explicit order the result is genuinely non-deterministic.
    const chargeRows = tx
      .select({ charge: purchaseCharges, purchase: purchases })
      .from(purchaseCharges)
      .innerJoin(purchases, eq(purchaseCharges.purchaseId, purchases.id))
      .where(
        and(
          inArray(purchaseCharges.id, [...linksByCharge.keys()]),
          inArray(purchases.id, pageOfPurchaseIds)
        )
      )
      .orderBy(
        desc(purchases.orderedAt),
        asc(purchases.id),
        asc(purchaseCharges.position),
        asc(purchaseCharges.id)
      )
      .all();

    return groupByPurchase(chargeRows, linksByCharge);
  });
}
