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
import { asc, desc, eq, inArray } from 'drizzle-orm';

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
  transactionUri: string
): readonly LinkedPurchase[] {
  const linkRows = db
    .select()
    .from(purchaseChargeLinks)
    .where(eq(purchaseChargeLinks.transactionUri, transactionUri))
    .all();
  if (linkRows.length === 0) return [];

  const linksByCharge = new Map(linkRows.map((link) => [link.chargeId, link]));

  // Charges and their orders in one join rather than two round trips,
  // ordered here so no caller has to re-sort: ids are random UUIDs and every
  // row of one ingest shares a `createdAt` to the second, so without an
  // explicit order the result is genuinely non-deterministic.
  const chargeRows = db
    .select({ charge: purchaseCharges, purchase: purchases })
    .from(purchaseCharges)
    .innerJoin(purchases, eq(purchaseCharges.purchaseId, purchases.id))
    .where(inArray(purchaseCharges.id, [...linksByCharge.keys()]))
    .orderBy(
      desc(purchases.orderedAt),
      asc(purchases.id),
      asc(purchaseCharges.position),
      asc(purchaseCharges.id)
    )
    .all();

  const byPurchase = new Map<string, { purchase: PurchaseRow; charges: LinkedCharge[] }>();
  for (const row of chargeRows) {
    const link = linksByCharge.get(row.charge.id);
    // A link whose charge is gone cannot exist — the foreign key cascades —
    // so this narrows the type rather than handling a real case.
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
