/**
 * Order reads.
 *
 * `getPurchase` assembles the whole order in one place — deliveries, lines,
 * charges, documents and the accounting split — because that is the shape
 * every consumer wants and re-deriving it per caller is how the residual
 * ends up computed three different ways.
 */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import {
  purchaseDocuments,
  purchaseItemNotes,
  purchaseItems,
  purchaseItemTags,
  purchaseItemUnits,
  purchases,
  purchaseShipments,
  purchaseTags,
} from '../schema.js';
import { computeAccounting, landedCostCents, type PurchaseAccounting } from './accounting.js';
import { groupBy } from './group-by.js';
import { nowIso, type PurchasesDb } from './internal.js';
import { orderedAtWindow } from './ordered-at.js';
import { selectChargeDetails, type PurchaseChargeDetail } from './purchase-read-charges.js';

import type { SQL } from 'drizzle-orm';

import type { PurchaseStatus } from '../../contract/constants.js';
import type { MerchantFilter } from '../../contract/merchant-filter.js';
import type {
  PurchaseDocumentRow,
  PurchaseItemRow,
  PurchaseItemUnitRow,
  PurchaseRow,
  PurchaseShipmentRow,
} from '../schema.js';

/**
 * Which orders a read is about, with no say in how many come back.
 *
 * Separate from {@link ListPurchasesFilter} because an aggregate has a scope
 * but no page: a roll-up computed over the first 500 of 748 orders is not a
 * smaller answer, it is a wrong one.
 */
export interface PurchaseScopeFilter {
  readonly sources?: readonly string[];
  readonly statuses?: readonly PurchaseStatus[];
  /**
   * Inclusive lower bound on `orderedAt`, in any ISO-8601 form with a
   * timezone. Normalised to the stored form before it becomes a predicate,
   * so an offset bound names the window it reads as.
   */
  readonly from?: string;
  /** Inclusive upper bound on `orderedAt`. Normalised like {@link from}. */
  readonly to?: string;
  /** The order's own currency, which the merchant roll-up also groups on. */
  readonly currency?: string;
  /** One merchant group, spelled the way the roll-up keys one. */
  readonly merchant?: MerchantFilter;
}

export interface ListPurchasesFilter extends PurchaseScopeFilter {
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * An item tag as a reader must receive it: never the slug on its own.
 *
 * `confirmedAt === null` is a classification pass's proposal; non-null is
 * an assertion. A list of lines "tagged `snack`" that mixes the two is a
 * counterfactual computed over guesses.
 */
export interface ItemTagReading {
  readonly tag: string;
  readonly confirmedAt: string | null;
}

/** A line with everything hanging off it, plus its derived landed cost. */
export interface PurchaseItemDetail {
  readonly item: PurchaseItemRow;
  /** POPS classification. Empty is the normal state — no source states one. */
  readonly tags: readonly ItemTagReading[];
  /** Verbatim merchant prose, in printed order. */
  readonly notes: readonly string[];
  readonly units: readonly PurchaseItemUnitRow[];
  /** `lineTotal + allocatedShipping + allocatedAdjustment`. */
  readonly landedCostCents: number;
}

/** An order and every list hanging off it. */
export interface PurchaseDetail {
  readonly purchase: PurchaseRow;
  /**
   * Facts about the order that are not fields — `date-uncertain` when the
   * receipt stated no date, `timezone-uncertain` when the shop's zone had
   * to be guessed. Read back because a mark nobody can see is not a mark.
   */
  readonly tags: readonly string[];
  readonly shipments: readonly PurchaseShipmentRow[];
  readonly items: readonly PurchaseItemDetail[];
  readonly charges: readonly PurchaseChargeDetail[];
  readonly documents: readonly PurchaseDocumentRow[];
  readonly accounting: PurchaseAccounting;
}

/**
 * The `purchases` predicates a filter denotes, as a list `and()` can take.
 *
 * Shared rather than rewritten per caller so an aggregate covers exactly the
 * rows the index covers for the same filter. Two hand-written copies of
 * "which orders are in scope" is how a merchant headline comes to disagree
 * with the list it is a headline for.
 */
export function purchaseFilterConditions(filter: PurchaseScopeFilter): readonly SQL[] {
  return [
    ...(filter.sources && filter.sources.length > 0
      ? [inArray(purchases.source, [...filter.sources])]
      : []),
    ...(filter.statuses && filter.statuses.length > 0
      ? [inArray(purchases.status, [...filter.statuses])]
      : []),
    ...orderedAtWindow(filter),
    ...(filter.currency === undefined ? [] : [eq(purchases.currency, filter.currency)]),
    ...(filter.merchant === undefined ? [] : merchantConditions(filter.merchant)),
  ];
}

/**
 * The `purchases` predicates one merchant group denotes.
 *
 * The `merchantEntityId IS NULL` on the `name` branch is the load-bearing
 * one, and dropping it is the silent widening this filter exists to avoid: a
 * `name` group holds exactly the orders that resolved to no entity, so
 * matching the label alone would sweep in every order that *did* resolve to
 * an entity wearing the same label. The list would then hold more orders than
 * the row it was opened from counted, and nothing on screen would say which
 * of the two figures was wrong.
 *
 * Symmetrically, an `entity` group is keyed on the id alone: an order
 * carrying the id is not obliged to also state the label, and the roll-up
 * takes its label from whichever of the group's orders is newest.
 */
function merchantConditions(merchant: MerchantFilter): readonly SQL[] {
  switch (merchant.resolution) {
    case 'entity':
      return [eq(purchases.merchantEntityId, merchant.entityId)];
    case 'name':
      return [isNull(purchases.merchantEntityId), eq(purchases.merchantEntityName, merchant.name)];
    case 'unattributed':
      return [isNull(purchases.merchantEntityId), isNull(purchases.merchantEntityName)];
  }
}

export function listPurchases(
  db: PurchasesDb,
  filter: ListPurchasesFilter = {}
): readonly PurchaseRow[] {
  const conditions = purchaseFilterConditions(filter);

  const base = db.select().from(purchases);
  const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;
  return filtered
    .orderBy(desc(purchases.orderedAt), asc(purchases.id))
    .limit(filter.limit ?? 100)
    .offset(filter.offset ?? 0)
    .all();
}

export function getPurchase(db: PurchasesDb, id: string): PurchaseDetail | undefined {
  const purchase = db.select().from(purchases).where(eq(purchases.id, id)).all()[0];
  if (purchase === undefined) return undefined;

  const shipments = db
    .select()
    .from(purchaseShipments)
    .where(eq(purchaseShipments.purchaseId, id))
    .orderBy(asc(purchaseShipments.position), asc(purchaseShipments.id))
    .all();

  const tags = db
    .select()
    .from(purchaseTags)
    .where(eq(purchaseTags.purchaseId, id))
    .orderBy(asc(purchaseTags.tag))
    .all()
    .map((row) => row.tag);

  const items = selectItemDetails(db, id);
  const charges = selectChargeDetails(db, id);
  const documents = db
    .select()
    .from(purchaseDocuments)
    .where(eq(purchaseDocuments.purchaseId, id))
    .orderBy(asc(purchaseDocuments.createdAt), asc(purchaseDocuments.id))
    .all();

  const linksByChargeId = new Map(charges.map((c) => [c.charge.id, c.links]));
  const accounting = computeAccounting(
    purchase.totalCents,
    charges.map((c) => c.charge),
    linksByChargeId
  );

  return { purchase, tags, shipments, items, charges, documents, accounting };
}

export function selectItemDetails(
  db: PurchasesDb,
  purchaseId: string
): readonly PurchaseItemDetail[] {
  const rows = db
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, purchaseId))
    .orderBy(asc(purchaseItems.position), asc(purchaseItems.id))
    .all();
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const tagRows = db
    .select()
    .from(purchaseItemTags)
    .where(inArray(purchaseItemTags.itemId, ids))
    .orderBy(asc(purchaseItemTags.tag))
    .all();
  // By position, not by insertion order: the position IS the ordering, and
  // it is the reason notes are not tag rows.
  const noteRows = db
    .select()
    .from(purchaseItemNotes)
    .where(inArray(purchaseItemNotes.itemId, ids))
    .orderBy(asc(purchaseItemNotes.position))
    .all();
  const unitRows = db
    .select()
    .from(purchaseItemUnits)
    .where(inArray(purchaseItemUnits.itemId, ids))
    .orderBy(asc(purchaseItemUnits.createdAt), asc(purchaseItemUnits.id))
    .all();

  const tagsByItem = groupBy(tagRows, (row) => row.itemId);
  const notesByItem = groupBy(noteRows, (row) => row.itemId);
  const unitsByItem = groupBy(unitRows, (row) => row.itemId);

  return rows.map((item) => ({
    item,
    tags: (tagsByItem.get(item.id) ?? []).map((row) => ({
      tag: row.tag,
      confirmedAt: row.confirmedAt,
    })),
    notes: (notesByItem.get(item.id) ?? []).map((row) => row.note),
    units: unitsByItem.get(item.id) ?? [],
    landedCostCents: landedCostCents(item),
  }));
}

/**
 * Set an order's reconciliation status. The engine owns this transition.
 *
 * `updatedAt` is written with the same `nowIso()` every other write path
 * uses. SQLite's `datetime('now')` would produce `2026-08-02 16:28:14`
 * where the service layer produces `2026-08-02T16:28:14.929Z`, and since a
 * space sorts before `T`, a row last touched here would sort before one
 * last touched by ingest regardless of which actually happened first.
 */
export function setPurchaseStatus(db: PurchasesDb, id: string, status: PurchaseStatus): boolean {
  return (
    db.update(purchases).set({ status, updatedAt: nowIso() }).where(eq(purchases.id, id)).run()
      .changes > 0
  );
}

/** Hard-delete an order. Everything hanging off it cascades. */
export function deletePurchase(db: PurchasesDb, id: string): boolean {
  return db.delete(purchases).where(eq(purchases.id, id)).run().changes > 0;
}
