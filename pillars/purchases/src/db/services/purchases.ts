/**
 * Purchase document reads and writes.
 *
 * Deliberately contains no matching logic — the reconciliation engine
 * (POPS-237) is a separate concern that consumes these rows. What lives
 * here is the document itself and the residual, because the residual is a
 * property of the document plus its links and nothing else.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { DuplicatePurchaseError, PurchaseSourceNotFoundError } from '../errors.js';
import { purchaseItems, purchases, purchaseTransactionLinks } from '../schema.js';
import { expectRow, nowIso, type PurchasesDb } from './internal.js';
import { getSource } from './sources.js';

import type {
  IngestMethod,
  ItemKind,
  PurchaseStatus,
  SettlementMode,
} from '../../contract/constants.js';
import type { PurchaseItemRow, PurchaseRow, PurchaseTransactionLinkRow } from '../schema.js';

export interface CreatePurchaseItemInput {
  readonly name: string;
  readonly sku?: string | null;
  readonly url?: string | null;
  readonly imageUrl?: string | null;
  readonly quantity?: number;
  readonly unitPriceCents: number;
  readonly lineTotalCents: number;
  readonly merchantCategory?: string | null;
  readonly tags?: readonly string[];
  readonly kind?: ItemKind | null;
}

export interface CreatePurchaseInput {
  readonly source: string;
  readonly sourceOrderId?: string | null;
  readonly ingestMethod: IngestMethod;
  readonly orderedAt: string;
  readonly currency: string;
  readonly subtotalCents?: number;
  readonly shippingCents?: number;
  readonly taxCents?: number;
  readonly discountCents?: number;
  readonly totalCents: number;
  readonly merchantEntityId?: string | null;
  readonly merchantEntityName?: string | null;
  readonly settlementMode?: SettlementMode;
  readonly paymentHint?: string | null;
  readonly rawRef?: string | null;
  readonly checksum: string;
  readonly items?: readonly CreatePurchaseItemInput[];
}

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

/** A purchase with everything needed to render or reconcile it. */
export interface PurchaseDetail {
  readonly purchase: PurchaseRow;
  readonly items: readonly PurchaseItemRow[];
  readonly links: readonly PurchaseTransactionLinkRow[];
  /**
   * `totalCents − Σ linked amountCents`. Never hidden, never auto-zeroed:
   * this is how gift cards, rewards balances, refunds and genuine misses
   * surface at all (ADR-042). Zero means fully explained; positive means
   * money left unexplained; negative means over-linked, which is a bug
   * worth seeing rather than clamping away.
   */
  readonly residualCents: number;
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

  const items = db
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, id))
    .orderBy(asc(purchaseItems.createdAt), asc(purchaseItems.id))
    .all();
  const links = db
    .select()
    .from(purchaseTransactionLinks)
    .where(eq(purchaseTransactionLinks.purchaseId, id))
    .orderBy(asc(purchaseTransactionLinks.createdAt), asc(purchaseTransactionLinks.id))
    .all();

  const linkedCents = links.reduce((sum, link) => sum + link.amountCents, 0);
  return { purchase, items, links, residualCents: purchase.totalCents - linkedCents };
}

export function findPurchaseByChecksum(db: PurchasesDb, checksum: string): PurchaseRow | undefined {
  return db.select().from(purchases).where(eq(purchases.checksum, checksum)).all()[0];
}

/**
 * Write a purchase and its lines in one transaction.
 *
 * Throws {@link DuplicatePurchaseError} when `checksum` already exists so an
 * ingest adapter can skip rather than duplicate. Throws
 * {@link PurchaseSourceNotFoundError} when `source` names a row that isn't
 * registered — a typo'd source would otherwise create a purchase the linker
 * can never block on.
 */
export function createPurchase(db: PurchasesDb, input: CreatePurchaseInput): PurchaseDetail {
  return db.transaction((tx) => {
    if (getSource(tx, input.source) === undefined) {
      throw new PurchaseSourceNotFoundError(input.source);
    }
    if (findPurchaseByChecksum(tx, input.checksum) !== undefined) {
      throw new DuplicatePurchaseError(input.checksum);
    }

    const now = nowIso();
    const purchase = insertPurchaseRow(tx, input, now);
    const items = (input.items ?? []).map((item) => insertItemRow(tx, purchase.id, item, now));

    return { purchase, items, links: [], residualCents: purchase.totalCents };
  });
}

function insertPurchaseRow(tx: PurchasesDb, input: CreatePurchaseInput, now: string): PurchaseRow {
  const rows = tx
    .insert(purchases)
    .values({
      source: input.source,
      sourceOrderId: input.sourceOrderId ?? null,
      ingestMethod: input.ingestMethod,
      orderedAt: input.orderedAt,
      currency: input.currency,
      subtotalCents: input.subtotalCents ?? 0,
      shippingCents: input.shippingCents ?? 0,
      taxCents: input.taxCents ?? 0,
      discountCents: input.discountCents ?? 0,
      totalCents: input.totalCents,
      merchantEntityId: input.merchantEntityId ?? null,
      merchantEntityName: input.merchantEntityName ?? null,
      settlementMode: input.settlementMode ?? 'unknown',
      paymentHint: input.paymentHint ?? null,
      rawRef: input.rawRef ?? null,
      checksum: input.checksum,
      // Cash is terminal on arrival: no transaction will ever settle it, so
      // it must never enter the reconcile queue (ADR-042).
      status: input.settlementMode === 'cash' ? 'settled_cash' : 'awaiting_settlement',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .all();
  return expectRow(rows, 'createPurchase');
}

function insertItemRow(
  tx: PurchasesDb,
  purchaseId: string,
  item: CreatePurchaseItemInput,
  now: string
): PurchaseItemRow {
  const rows = tx
    .insert(purchaseItems)
    .values({
      purchaseId,
      name: item.name,
      sku: item.sku ?? null,
      url: item.url ?? null,
      imageUrl: item.imageUrl ?? null,
      quantity: item.quantity ?? 1,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      merchantCategory: item.merchantCategory ?? null,
      tags: JSON.stringify(item.tags ?? []),
      kind: item.kind ?? null,
      createdAt: now,
    })
    .returning()
    .all();
  return expectRow(rows, 'createPurchase.item');
}

/**
 * Set a purchase's reconciliation status. The engine owns this transition;
 * exposed here so ingest can mark a cash purchase terminal at write time.
 */
export function setPurchaseStatus(db: PurchasesDb, id: string, status: PurchaseStatus): boolean {
  return (
    db
      .update(purchases)
      .set({ status, updatedAt: sql`(datetime('now'))` })
      .where(eq(purchases.id, id))
      .run().changes > 0
  );
}

/** Hard-delete a purchase. Items and links cascade. */
export function deletePurchase(db: PurchasesDb, id: string): boolean {
  return db.delete(purchases).where(eq(purchases.id, id)).run().changes > 0;
}
