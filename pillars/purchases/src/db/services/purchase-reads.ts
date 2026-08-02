/**
 * Order reads.
 *
 * `getPurchase` assembles the whole order in one place — deliveries, lines,
 * charges, documents and the accounting split — because that is the shape
 * every consumer wants and re-deriving it per caller is how the residual
 * ends up computed three different ways.
 */
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';

import {
  purchaseChargeLinks,
  purchaseCharges,
  purchaseDocuments,
  purchaseItemAllocations,
  purchaseItems,
  purchaseItemTags,
  purchaseItemUnits,
  purchases,
  purchaseShipments,
} from '../schema.js';
import { computeAccounting, landedCostCents, type PurchaseAccounting } from './accounting.js';
import { nowIso, type PurchasesDb } from './internal.js';

import type { PurchaseStatus } from '../../contract/constants.js';
import type {
  PurchaseChargeLinkRow,
  PurchaseChargeRow,
  PurchaseDocumentRow,
  PurchaseItemAllocationRow,
  PurchaseItemRow,
  PurchaseItemUnitRow,
  PurchaseRow,
  PurchaseShipmentRow,
} from '../schema.js';

export interface ListPurchasesFilter {
  readonly sources?: readonly string[];
  readonly statuses?: readonly PurchaseStatus[];
  /** Inclusive lower bound on `orderedAt` (ISO-8601). */
  readonly from?: string;
  /** Inclusive upper bound on `orderedAt` (ISO-8601). */
  readonly to?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/** A line with everything hanging off it, plus its derived landed cost. */
export interface PurchaseItemDetail {
  readonly item: PurchaseItemRow;
  readonly tags: readonly string[];
  readonly units: readonly PurchaseItemUnitRow[];
  /** `lineTotal + allocatedShipping + allocatedAdjustment`. */
  readonly landedCostCents: number;
}

/** A charge, the transactions backing it (if any), and what it paid for. */
export interface PurchaseChargeDetail {
  readonly charge: PurchaseChargeRow;
  readonly links: readonly PurchaseChargeLinkRow[];
  readonly allocations: readonly PurchaseItemAllocationRow[];
}

/** An order and every list hanging off it. */
export interface PurchaseDetail {
  readonly purchase: PurchaseRow;
  readonly shipments: readonly PurchaseShipmentRow[];
  readonly items: readonly PurchaseItemDetail[];
  readonly charges: readonly PurchaseChargeDetail[];
  readonly documents: readonly PurchaseDocumentRow[];
  readonly accounting: PurchaseAccounting;
}

export function listPurchases(
  db: PurchasesDb,
  filter: ListPurchasesFilter = {}
): readonly PurchaseRow[] {
  const conditions = [
    ...(filter.sources && filter.sources.length > 0
      ? [inArray(purchases.source, [...filter.sources])]
      : []),
    ...(filter.statuses && filter.statuses.length > 0
      ? [inArray(purchases.status, [...filter.statuses])]
      : []),
    ...(filter.from === undefined ? [] : [gte(purchases.orderedAt, filter.from)]),
    ...(filter.to === undefined ? [] : [lte(purchases.orderedAt, filter.to)]),
  ];

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

  return { purchase, shipments, items, charges, documents, accounting };
}

function selectItemDetails(db: PurchasesDb, purchaseId: string): readonly PurchaseItemDetail[] {
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
  const unitRows = db
    .select()
    .from(purchaseItemUnits)
    .where(inArray(purchaseItemUnits.itemId, ids))
    .orderBy(asc(purchaseItemUnits.createdAt), asc(purchaseItemUnits.id))
    .all();

  const tagsByItem = groupBy(tagRows, (row) => row.itemId);
  const unitsByItem = groupBy(unitRows, (row) => row.itemId);

  return rows.map((item) => ({
    item,
    tags: (tagsByItem.get(item.id) ?? []).map((row) => row.tag),
    units: unitsByItem.get(item.id) ?? [],
    landedCostCents: landedCostCents(item),
  }));
}

function selectChargeDetails(db: PurchasesDb, purchaseId: string): readonly PurchaseChargeDetail[] {
  const rows = db
    .select()
    .from(purchaseCharges)
    .where(eq(purchaseCharges.purchaseId, purchaseId))
    .orderBy(asc(purchaseCharges.position), asc(purchaseCharges.id))
    .all();
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const linkRows = db
    .select()
    .from(purchaseChargeLinks)
    .where(inArray(purchaseChargeLinks.chargeId, ids))
    .orderBy(asc(purchaseChargeLinks.createdAt), asc(purchaseChargeLinks.id))
    .all();
  const allocationRows = db
    .select()
    .from(purchaseItemAllocations)
    .where(inArray(purchaseItemAllocations.chargeId, ids))
    .orderBy(asc(purchaseItemAllocations.createdAt), asc(purchaseItemAllocations.id))
    .all();

  const linksByCharge = groupBy(linkRows, (row) => row.chargeId);
  const allocationsByCharge = groupBy(allocationRows, (row) => row.chargeId);

  return rows.map((charge) => ({
    charge,
    links: linksByCharge.get(charge.id) ?? [],
    allocations: allocationsByCharge.get(charge.id) ?? [],
  }));
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = out.get(k);
    if (bucket === undefined) out.set(k, [row]);
    else bucket.push(row);
  }
  return out;
}

/**
 * Every line carrying a given tag, across every order. The query
 * `purchase_item_tags` exists to serve — a JSON array column would answer
 * it only with a full scan.
 */
export function listItemsByTag(
  db: PurchasesDb,
  tag: string,
  limit = 200
): readonly PurchaseItemRow[] {
  return db
    .select({ item: purchaseItems })
    .from(purchaseItemTags)
    .innerJoin(purchaseItems, eq(purchaseItems.id, purchaseItemTags.itemId))
    .where(eq(purchaseItemTags.tag, tag))
    .orderBy(desc(purchaseItems.createdAt), asc(purchaseItems.position), asc(purchaseItems.id))
    .limit(limit)
    .all()
    .map((row) => row.item);
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
