/**
 * Identity lookups that make ingest idempotent.
 *
 * Both exist so a re-run of the same import is a no-op. `checksum` catches a
 * byte-identical re-upload; `(source, sourceOrderId)` catches the same
 * merchant order arriving under a different checksum, which happens whenever
 * an adapter changes how it hashes a row.
 *
 * Separated from the read path because these answer "have we seen this
 * before" rather than "show me this order", and only the write path calls
 * them.
 */
import { and, eq } from 'drizzle-orm';

import { purchases } from '../schema.js';

import type { PurchaseRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';

export function findPurchaseByChecksum(db: PurchasesDb, checksum: string): PurchaseRow | undefined {
  return db.select().from(purchases).where(eq(purchases.checksum, checksum)).all()[0];
}

/**
 * Find an order by the merchant's own identifier.
 *
 * The second half of ingest idempotency. `checksum` only catches a
 * byte-identical re-upload; this catches the same order arriving under a
 * different checksum because the adapter changed how it hashes a row.
 */
export function findPurchaseBySourceOrderId(
  db: PurchasesDb,
  source: string,
  sourceOrderId: string
): PurchaseRow | undefined {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.source, source), eq(purchases.sourceOrderId, sourceOrderId)))
    .all()[0];
}
