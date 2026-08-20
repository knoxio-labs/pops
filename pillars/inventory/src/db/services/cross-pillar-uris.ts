/**
 * Cross-pillar URI denormalisation helpers.
 *
 * `home_inventory.purchase_transaction_uri` is a soft reference to a row the
 * finance pillar owns. It is not independently settable: it is derived from
 * `purchase_transaction_id`, which the item contract already carries, so the
 * two can never disagree. `purchaseTransactionUriFor` is the single place that
 * spelling lives, and both item builders go through it.
 *
 * The reconciliation cron walks the distinct URIs and asks finance whether each
 * still resolves. To keep the cron HTTP-shaped and the persistence layer
 * concern-free, this module exposes only what the cron needs:
 *
 *   - `listDistinctPurchaseTransactionUris` — read-side fan-out
 *   - `markPurchaseTransactionUriStale` / `clearPurchaseTransactionUriStale` —
 *     write-side reconciliation
 *   - `countRowsMissingPurchaseTransactionUri` — the derivation's own alarm
 *
 * The stale columns are best-effort warnings, not deletes — a row survives its
 * target 404ing, and consumers branch on the stale marker.
 *
 * `owner_uri` / `owner_stale_at` have no writer and no field on the contract
 * that could name a user, so they are dormant and no leg reconciles them. See
 * the pillar README.
 */
import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';

import { homeInventory } from '../schema.js';

import type { InventoryDb } from './internal.js';

/**
 * The `purchase_transaction_uri` a given `purchase_transaction_id` denotes.
 *
 * Must stay byte-identical to the expression migration
 * `0008_cross_pillar_uri_denorm.sql` used to backfill the column, or rows
 * written before and after that migration point at two different URIs for one
 * transaction and reconcile as two.
 */
export function purchaseTransactionUriFor(
  purchaseTransactionId: string | null | undefined
): string | null {
  if (typeof purchaseTransactionId !== 'string') return null;
  if (purchaseTransactionId.length === 0) return null;
  return `pops://finance/transaction/${purchaseTransactionId}`;
}

/** Return every distinct, non-null `purchase_transaction_uri` on inventory rows. */
export function listDistinctPurchaseTransactionUris(db: InventoryDb): string[] {
  const rows = db
    .selectDistinct({ uri: homeInventory.purchaseTransactionUri })
    .from(homeInventory)
    .where(isNotNull(homeInventory.purchaseTransactionUri))
    .all();
  return rows.map((r) => r.uri).filter((u): u is string => typeof u === 'string' && u.length > 0);
}

/**
 * Count rows that name a finance transaction but carry no URI for it.
 *
 * This is the derivation's alarm rather than a statistic. Every write path
 * that sets `purchase_transaction_id` also sets the URI, so a non-zero count
 * means either a writer stopped deriving or rows arrived by a path that does
 * not go through the item builders. Both are invisible otherwise: the cron
 * would simply find a smaller work set and report success over it.
 */
export function countRowsMissingPurchaseTransactionUri(db: InventoryDb): number {
  const rows = db
    .select({ count: sql<number>`count(*)` })
    .from(homeInventory)
    .where(
      and(
        isNotNull(homeInventory.purchaseTransactionId),
        ne(homeInventory.purchaseTransactionId, ''),
        isNull(homeInventory.purchaseTransactionUri)
      )
    )
    .all();
  return rows[0]?.count ?? 0;
}

/**
 * Stamp `purchase_transaction_stale_at` on every row pointing at `uri`. The
 * caller passes the cron tick's `now()` so tests can pin time deterministically.
 */
export function markPurchaseTransactionUriStale(
  db: InventoryDb,
  uri: string,
  stampIso: string
): number {
  const result = db
    .update(homeInventory)
    .set({ purchaseTransactionStaleAt: stampIso })
    .where(eq(homeInventory.purchaseTransactionUri, uri))
    .run();
  return result.changes;
}

/** Clear staleness — used when an earlier 404 resolves on a later tick. */
export function clearPurchaseTransactionUriStale(db: InventoryDb, uri: string): number {
  const result = db
    .update(homeInventory)
    .set({ purchaseTransactionStaleAt: null })
    .where(eq(homeInventory.purchaseTransactionUri, uri))
    .run();
  return result.changes;
}
