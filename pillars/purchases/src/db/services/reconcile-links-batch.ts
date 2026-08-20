/**
 * The link table read backwards for many transactions at once.
 *
 * `listPurchasesForTransaction` answers one transaction completely, which is
 * the right shape for a panel and the wrong one for a list: a table drawing
 * "does an order explain this row" over a page of fifty would call it fifty
 * times. This reads the same table with the same joins, once, and counts.
 *
 * **Counts, not orders.** An indicator can render a count and nothing more,
 * and returning the orders themselves would make the batch a second, fuller
 * answer to the question the singular read already answers — two payloads
 * describing one relationship, free to drift. A consumer that wants the
 * orders opens the one transaction it is asking about.
 *
 * **No money.** A charge's currency is the producer's settlement currency and
 * one transaction may settle orders in more than one, so a single summed
 * figure here would be a cross-currency total wearing a currency's clothes.
 * The per-order shares stay available from the singular read, each in the
 * currency it settled in.
 *
 * **Confirmed and derived are counted apart** because they are different
 * claims about the same row: one is a decision somebody made, the other is
 * what the matcher currently believes and a later sweep may withdraw. A
 * single "has a purchase" flag would report the second as the first.
 */
import { eq, inArray } from 'drizzle-orm';

import { purchaseChargeLinks, purchaseCharges, purchases } from '../schema.js';

import type { PurchasesDb } from './internal.js';

/** One transaction's linkage, at the grain a list indicator can draw. */
export interface TransactionLinkSummary {
  readonly transactionUri: string;
  /** Distinct orders with at least one charge linked here. `> 1` is a combined settlement. */
  readonly purchaseCount: number;
  /** Links a human pinned. */
  readonly confirmedChargeCount: number;
  /** Links the matcher derived and nobody has confirmed. */
  readonly derivedChargeCount: number;
}

interface Tally {
  readonly purchaseIds: Set<string>;
  confirmed: number;
  derived: number;
}

interface LinkRow {
  readonly transactionUri: string;
  readonly confirmedAt: string | null;
  readonly purchaseId: string;
}

function tally(rows: readonly LinkRow[]): Map<string, Tally> {
  const byUri = new Map<string, Tally>();
  for (const row of rows) {
    let entry = byUri.get(row.transactionUri);
    if (entry === undefined) {
      entry = { purchaseIds: new Set(), confirmed: 0, derived: 0 };
      byUri.set(row.transactionUri, entry);
    }
    entry.purchaseIds.add(row.purchaseId);
    if (row.confirmedAt === null) entry.derived += 1;
    else entry.confirmed += 1;
  }
  return byUri;
}

/**
 * One summary per requested transaction that any order explains, in the order
 * the caller asked, duplicates collapsed.
 *
 * A transaction no order explains is **absent** rather than present with
 * zeroes. Most of a statement is that case, so an answer proportional to the
 * linkage rather than to the question is the smaller payload by a wide margin,
 * and there is no zero-count row for a consumer to render as an indicator that
 * says nothing.
 *
 * The joins mirror `listPurchasesForTransaction` exactly — link → charge →
 * order — so a row one of them counts is a row the other returns. Reaching the
 * order table is what makes that true rather than nearly true: the singular
 * read groups by order and would drop a link whose order had gone, and a count
 * taken one join short would not.
 */
export function summariseLinksForTransactions(
  db: PurchasesDb,
  transactionUris: readonly string[]
): readonly TransactionLinkSummary[] {
  const wanted = [...new Set(transactionUris)];
  if (wanted.length === 0) return [];

  const rows = db
    .select({
      transactionUri: purchaseChargeLinks.transactionUri,
      confirmedAt: purchaseChargeLinks.confirmedAt,
      purchaseId: purchaseCharges.purchaseId,
    })
    .from(purchaseChargeLinks)
    .innerJoin(purchaseCharges, eq(purchaseCharges.id, purchaseChargeLinks.chargeId))
    .innerJoin(purchases, eq(purchases.id, purchaseCharges.purchaseId))
    .where(inArray(purchaseChargeLinks.transactionUri, wanted))
    .all();

  const byUri = tally(rows);

  return wanted.flatMap((transactionUri) => {
    const entry = byUri.get(transactionUri);
    if (entry === undefined) return [];
    return [
      {
        transactionUri,
        purchaseCount: entry.purchaseIds.size,
        confirmedChargeCount: entry.confirmed,
        derivedChargeCount: entry.derived,
      },
    ];
  });
}
