/**
 * Cross-pillar soft-URI helpers for the purchases pillar.
 *
 * Two columns in this schema hold references to rows another pillar owns:
 * `purchase_item_units.inventory_item_uri` (`pops://inventory/item/<id>`)
 * and `purchase_documents.document_uri` (`pops://documents/document/<id>`).
 * Each carries a `*_stale_at` companion, and ADR-042 is explicit that the
 * companion is resolved by a nightly cron and never at read time — so the
 * cron in `api/cron/` is the ONLY writer of these two columns, and the
 * `list… / mark…Stale / clear…Stale` trio below is its entire vocabulary.
 *
 * Rows are flagged, never deleted: existence in another pillar is
 * best-effort, and a reference that stops resolving is evidence to show a
 * human rather than grounds to destroy the line it hangs off.
 */
import { eq, isNotNull } from 'drizzle-orm';

import { purchaseDocuments } from '../schema/documents.js';
import { purchaseItemUnits } from '../schema/items.js';

import type { PurchasesDb } from './internal.js';

/**
 * Every distinct non-null `inventory_item_uri` on `purchase_item_units`.
 * The cron's work set for the inventory leg of one tick.
 */
export function listDistinctInventoryItemUris(db: PurchasesDb): string[] {
  const rows = db
    .selectDistinct({ uri: purchaseItemUnits.inventoryItemUri })
    .from(purchaseItemUnits)
    .where(isNotNull(purchaseItemUnits.inventoryItemUri))
    .all();
  return collectUris(rows);
}

/**
 * Stamp `inventory_item_stale_at` on every unit referencing `uri` — the
 * inventory pillar returned a genuine 404 for it. Idempotent; re-stamping
 * an already-stale row just moves the timestamp forward. Returns the
 * number of rows affected.
 */
export function markInventoryItemUriStale(db: PurchasesDb, uri: string, nowIso: string): number {
  return db
    .update(purchaseItemUnits)
    .set({ inventoryItemStaleAt: nowIso })
    .where(eq(purchaseItemUnits.inventoryItemUri, uri))
    .run().changes;
}

/**
 * Clear `inventory_item_stale_at` on every unit referencing `uri` — the
 * inventory pillar resolved it again.
 *
 * Clearing matters as much as marking: without it a single inventory
 * outage that happened to answer 404 would poison the reference
 * permanently. Returns the number of rows affected.
 */
export function clearInventoryItemUriStale(db: PurchasesDb, uri: string): number {
  return db
    .update(purchaseItemUnits)
    .set({ inventoryItemStaleAt: null })
    .where(eq(purchaseItemUnits.inventoryItemUri, uri))
    .run().changes;
}

/** Every distinct `document_uri` on `purchase_documents` (the column is NOT NULL). */
export function listDistinctDocumentUris(db: PurchasesDb): string[] {
  const rows = db
    .selectDistinct({ uri: purchaseDocuments.documentUri })
    .from(purchaseDocuments)
    .all();
  return collectUris(rows);
}

/** Stamp `document_stale_at` on every document row referencing `uri`. See {@link markInventoryItemUriStale}. */
export function markDocumentUriStale(db: PurchasesDb, uri: string, nowIso: string): number {
  return db
    .update(purchaseDocuments)
    .set({ documentStaleAt: nowIso })
    .where(eq(purchaseDocuments.documentUri, uri))
    .run().changes;
}

/** Clear `document_stale_at` on every document row referencing `uri`. See {@link clearInventoryItemUriStale}. */
export function clearDocumentUriStale(db: PurchasesDb, uri: string): number {
  return db
    .update(purchaseDocuments)
    .set({ documentStaleAt: null })
    .where(eq(purchaseDocuments.documentUri, uri))
    .run().changes;
}

function collectUris(rows: readonly { uri: string | null }[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    if (row.uri !== null) out.push(row.uri);
  }
  return out;
}
