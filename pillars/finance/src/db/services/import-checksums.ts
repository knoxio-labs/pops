/**
 * Checksum lookups and the settle write behind them.
 *
 * Split out of `imports.ts` (POPS-3068) along the seam that file's own header
 * already described: this is the batch-level bookkeeping — "have I seen these
 * rows before, and what state is the stored one in" — where `imports.ts` keeps
 * the per-row insert. Both read `transactions`; only this one is driven by a
 * whole source file's worth of checksums at once, which is why the IN-list
 * batching constant belongs here and nowhere else.
 *
 * Re-exported through `imports.ts` so `importsService.*` still names all of it.
 */
import { eq, inArray } from 'drizzle-orm';

import { isPositiveAmountPurchase } from '../../contract/corrections-constants.js';
import { PositiveAmountPurchaseError } from '../errors.js';
import { transactions } from '../schema.js';

import type { FinanceDb } from './internal.js';

/**
 * SQLite's `SQLITE_MAX_VARIABLE_NUMBER` defaults to 999, so an IN-list longer
 * than that fails outright rather than degrading.
 */
const CHECKSUM_BATCH_SIZE = 500;

/** What a settled source row overwrites on the pending row it matches. */
export interface SettleImportedTransactionInput {
  date: string;
  amountCents: number;
  rawRow: string;
}

/** A stored row as the settle check sees it. */
export interface StoredChecksumRow {
  id: string;
  pending: boolean;
}

/** The stored rows behind `checksums`, keyed by checksum, for the settle check (POPS-30). */
export function findTransactionsByChecksums(
  db: FinanceDb,
  checksums: readonly string[]
): Map<string, StoredChecksumRow> {
  if (checksums.length === 0) return new Map();
  const rows = db
    .select({
      id: transactions.id,
      checksum: transactions.checksum,
      pending: transactions.pending,
    })
    .from(transactions)
    .where(inArray(transactions.checksum, [...checksums]))
    .all();
  const byChecksum = new Map<string, StoredChecksumRow>();
  for (const row of rows) {
    if (row.checksum !== null) byChecksum.set(row.checksum, row);
  }
  return byChecksum;
}

/**
 * A held row came back settled: overwrite the three things a settlement can
 * change and clear the flag. Nothing a person may have edited — entity, tags,
 * notes — is touched.
 *
 * A settlement is the one write that changes an amount without touching the
 * type, so it is the one that can turn a coherent row into a positive
 * `purchase` (POPS-2685) without anybody choosing to. It would mean the source
 * settled a held card authorisation at the opposite sign — the original
 * classification is then wrong for the settled amount, and picking the right
 * replacement (`refund`? `reversal`?) is a decision this function has no basis
 * to make. So it refuses, and the caller decides; the row stays `pending` and
 * is offered again on the next sync rather than being lost.
 */
export function settleImportedTransaction(
  db: FinanceDb,
  id: string,
  input: SettleImportedTransactionInput
): void {
  const stored = db
    .select({ type: transactions.type })
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  if (stored !== undefined && isPositiveAmountPurchase(input.amountCents, stored.type)) {
    throw new PositiveAmountPurchaseError(input.amountCents);
  }

  db.update(transactions)
    .set({
      date: input.date,
      amountCents: input.amountCents,
      rawRow: input.rawRow,
      pending: false,
      lastEditedTime: new Date().toISOString(),
    })
    .where(eq(transactions.id, id))
    .run();
}

/**
 * Return the subset of `checksums` that already exist in the `transactions`
 * table. Empty input returns an empty set without issuing a query.
 *
 * Batched at {@link CHECKSUM_BATCH_SIZE} per IN-list.
 */
export function findExistingChecksums(db: FinanceDb, checksums: string[]): Set<string> {
  if (checksums.length === 0) return new Set();

  const existing = new Set<string>();
  for (let i = 0; i < checksums.length; i += CHECKSUM_BATCH_SIZE) {
    const batch = checksums.slice(i, i + CHECKSUM_BATCH_SIZE);
    const rows = db
      .select({ checksum: transactions.checksum })
      .from(transactions)
      .where(inArray(transactions.checksum, batch))
      .all();
    for (const row of rows) {
      if (row.checksum) existing.add(row.checksum);
    }
  }

  return existing;
}
