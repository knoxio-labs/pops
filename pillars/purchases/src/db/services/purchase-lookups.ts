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
import { canonicalInstant } from './ordered-at.js';

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

/**
 * A purchase from the same source, shop-moment and amount.
 *
 * The photograph's hash catches an identical file, which is not what a
 * person does: they take a second picture, from a slightly different
 * angle, of the same piece of paper. Those bytes differ, so the store
 * dedup cannot see it and two records of one shop get written.
 *
 * The merchant name cannot be part of the key — the same Kmart receipt
 * read twice gave "K MART ASHFIELD" and "K mart" — but the printed
 * timestamp, currency and total were identical every time, and a second
 * genuine purchase in the same minute for the same amount is not a thing
 * that happens to one person.
 *
 * Best-effort by construction. It reads before it writes, so two uploads
 * racing each other can both pass and both be written. That is deliberate:
 * the alternative is a unique index over the same columns, which would
 * turn a rare false positive — two different shops at the same stated
 * minute for the same amount — from a visible 409 into a write that fails
 * and loses a real purchase.
 *
 * The stated timestamp is normalised to the stored form before it is
 * matched. Comparing the caller's spelling against the column's would miss
 * the re-upload this exists to catch whenever the two differ, which is the
 * whole reason the column has one spelling. A timestamp naming no instant
 * is matched as it was written: the only row it can equal is one migration
 * `0010` could not read either, and that row is the same shop. The write
 * that follows refuses such a timestamp regardless.
 */
export interface ShopMoment {
  readonly source: string;
  readonly orderedAt: string;
  readonly totalCents: number;
  readonly currency: string;
}

export function findPurchaseAtInstantForAmount(
  db: PurchasesDb,
  moment: ShopMoment
): PurchaseRow | undefined {
  const { source, orderedAt, totalCents, currency } = moment;
  return db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.source, source),
        eq(purchases.orderedAt, canonicalInstant(orderedAt) ?? orderedAt),
        eq(purchases.totalCents, totalCents),
        // Cents are a number without one. 3000 is $30.00 and ¥3000, and a
        // traveller can hold both — refusing the second as a duplicate of
        // the first would lose a real shop.
        eq(purchases.currency, currency)
      )
    )
    .all()[0];
}
