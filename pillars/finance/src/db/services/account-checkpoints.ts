/**
 * Data access for `account_checkpoints` (POPS-2878, ADR-051).
 *
 * Pure persistence: insert, list, find the anchor either side of a date, and
 * delete a hand-typed mistake. No balance maths lives here — `balanceAsOf`
 * and the expected-vs-actual delta are `account-balance.ts`'s job (POPS-2879),
 * and keeping them apart is what stops a stored balance creeping back in.
 *
 * Rows are APPEND-ONLY. There is no update primitive, deliberately: a
 * checkpoint is a claim about what an account held on a particular day, and a
 * second count is a second claim rather than a correction to the first. The
 * newest one wins by `created_at` when two share a date.
 */
import { and, asc, desc, eq, gt, lte } from 'drizzle-orm';

import { CheckpointSourceNotDeletableError } from '../errors.js';
import { accountCheckpoints } from '../schema.js';

import type { CheckpointSource } from '../../contract/checkpoint.js';
import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape for `account_checkpoints`. */
export type AccountCheckpointRow = typeof accountCheckpoints.$inferSelect;

/**
 * Fields accepted by {@link insertCheckpoint}.
 *
 * `balanceCents` is ledger-signed — positive is money held, negative is money
 * owed — for every kind of account. A caller holding an "amount owed" figure
 * negates it before it gets here.
 */
export interface InsertCheckpointInput {
  accountId: string;
  balanceCents: number;
  /** ISO `YYYY-MM-DD`; the balance is the end-of-day figure for this date. */
  asOf: string;
  source: CheckpointSource;
  /** Import commit key or statement document id. Null for a `manual` row. */
  sourceRef?: string | null;
  note?: string | null;
}

/**
 * Append a checkpoint.
 *
 * Throws the underlying SQLite constraint error when a non-`manual` row would
 * duplicate `(accountId, asOf, source)` — re-importing the same statement must
 * not double a checkpoint. Two `manual` rows on one day are legal.
 */
export function insertCheckpoint(
  db: FinanceDb,
  input: InsertCheckpointInput
): AccountCheckpointRow {
  return db
    .insert(accountCheckpoints)
    .values({
      accountId: input.accountId,
      balanceCents: input.balanceCents,
      asOf: input.asOf,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      note: input.note ?? null,
    })
    .returning()
    .get();
}

/**
 * Every checkpoint for an account, newest first — by `asOf`, then by
 * `createdAt` so two counts on the same day come back in the order they were
 * made. This is the order the history list and every anchor read expect.
 */
export function listCheckpoints(db: FinanceDb, accountId: string): AccountCheckpointRow[] {
  return db
    .select()
    .from(accountCheckpoints)
    .where(eq(accountCheckpoints.accountId, accountId))
    .orderBy(desc(accountCheckpoints.asOf), desc(accountCheckpoints.createdAt))
    .all();
}

/**
 * The checkpoint to anchor a balance for `date` on: the newest one dated at or
 * before it. `date` is inclusive — a checkpoint's `asOf` day is inside it.
 */
export function latestCheckpointAtOrBefore(
  db: FinanceDb,
  accountId: string,
  date: string
): AccountCheckpointRow | undefined {
  return db
    .select()
    .from(accountCheckpoints)
    .where(and(eq(accountCheckpoints.accountId, accountId), lte(accountCheckpoints.asOf, date)))
    .orderBy(desc(accountCheckpoints.asOf), desc(accountCheckpoints.createdAt))
    .limit(1)
    .get();
}

/**
 * The earliest checkpoint strictly after `date` — what a balance for a date
 * before the account's first checkpoint derives backwards from, so a
 * twelve-month trend is anchored rather than net flow.
 */
export function earliestCheckpointAfter(
  db: FinanceDb,
  accountId: string,
  date: string
): AccountCheckpointRow | undefined {
  return db
    .select()
    .from(accountCheckpoints)
    .where(and(eq(accountCheckpoints.accountId, accountId), gt(accountCheckpoints.asOf, date)))
    .orderBy(asc(accountCheckpoints.asOf), asc(accountCheckpoints.createdAt))
    .limit(1)
    .get();
}

/** One checkpoint by id, or undefined. */
export function getCheckpoint(db: FinanceDb, id: string): AccountCheckpointRow | undefined {
  return db.select().from(accountCheckpoints).where(eq(accountCheckpoints.id, id)).get();
}

/**
 * Delete a checkpoint. Only a `manual` row may go: an `import` or `statement`
 * row is what a file said, and deleting it would just invite the next import
 * to mint it again. Returns false when no such row exists.
 *
 * @throws {CheckpointSourceNotDeletableError} when the row is machine-sourced.
 */
export function deleteCheckpoint(db: FinanceDb, id: string): boolean {
  const row = getCheckpoint(db, id);
  if (row === undefined) return false;
  if (row.source !== 'manual') throw new CheckpointSourceNotDeletableError(id, row.source);
  db.delete(accountCheckpoints).where(eq(accountCheckpoints.id, id)).run();
  return true;
}
