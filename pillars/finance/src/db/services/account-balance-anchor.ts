/**
 * The primitives a checkpoint-anchored balance is made of (POPS-2879,
 * ADR-051): the shapes it is reported in, the prefix sum it is built from,
 * which checkpoint anchors a given date, and how far a checkpoint is from
 * what the ledger predicted for it.
 *
 * Separate from `account-balance.ts` so the reading itself, the batched
 * reading and the month-end trend all rest on one copy of these rather than
 * on three implementations of the same arithmetic.
 *
 * A balance is the nearest checkpoint plus the transactions between it and
 * the date asked for. Both anchored directions collapse to one expression:
 *
 * ```
 * balance(date) = anchor.balance + Σ(tx.date <= date) - Σ(tx.date <= anchor.asOf)
 * ```
 *
 * Forward (the anchor is behind the date) that adds the transactions since
 * the checkpoint; backward (the anchor is ahead of it) the same subtraction
 * runs the other way and unwinds them.
 *
 * Every figure here is ledger-signed: positive is money held, negative is
 * money owed, for assets and liabilities alike.
 */
import { and, eq, lte, sum } from 'drizzle-orm';

import { transactions } from '../schema.js';
import {
  earliestCheckpointAfter,
  latestCheckpoint,
  latestCheckpointAtOrBefore,
} from './account-checkpoints.js';

import type { CheckpointSource } from '../../contract/checkpoint.js';
import type { AccountCheckpointRow } from './account-checkpoints.js';
import type { FinanceDb } from './internal.js';

/** How a balance was arrived at. `transactions` means net flow, and says so. */
export type BalanceBasis = 'checkpoint' | 'transactions';

/** The checkpoint a balance was anchored on. */
export interface BalanceAnchor {
  checkpointId: string;
  /** ISO `YYYY-MM-DD` the anchoring checkpoint was true as of. */
  asOf: string;
  source: CheckpointSource;
}

/** An account's balance at a date, and how much to trust it. */
export interface AccountBalance {
  /** Ledger-signed minor units: positive is held, negative is owed. */
  balanceCents: number;
  /** ISO `YYYY-MM-DD` this balance is stated as of — the date asked for. */
  asOf: string;
  basis: BalanceBasis;
  /** Null only when the account has no checkpoint at all. */
  anchor: BalanceAnchor | null;
  /**
   * True when the account's LATEST checkpoint disagrees with what the ledger
   * predicted for it. Only the latest counts: an older flagged checkpoint
   * followed by a consistent newer one has been re-anchored, and the account
   * is no longer in question. Independent of the date asked for — it is a
   * statement about the account's data, not about this reading.
   */
  inconsistent: boolean;
}

/** A checkpoint measured against what the ledger predicted for it. */
export interface CheckpointDelta {
  /** What the previous checkpoint plus the transactions between them implies. */
  expectedBalanceCents: number;
  /** `checkpoint.balanceCents - expectedBalanceCents`. Zero means agreement. */
  deltaCents: number;
}

/** Today as ISO `YYYY-MM-DD`, UTC — the same form `transactions.date` stores. */
export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The ISO day before `date`, for a caller that wants a strictly-before sum. */
export function dayBefore(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

/** Σ `amountCents` for every transaction dated at or before `date`, inclusive. */
export function sumThrough(db: FinanceDb, accountId: string, date: string): number {
  const row = db
    .select({ total: sum(transactions.amountCents) })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), lte(transactions.date, date)))
    .get();
  return Number(row?.total ?? 0);
}

export function toAnchor(checkpoint: AccountCheckpointRow): BalanceAnchor {
  return { checkpointId: checkpoint.id, asOf: checkpoint.asOf, source: checkpoint.source };
}

/**
 * The checkpoint to anchor `date` on: the nearest one at or before it, else
 * the earliest one after it, else none.
 */
export function anchorFor(
  db: FinanceDb,
  accountId: string,
  date: string
): AccountCheckpointRow | undefined {
  return (
    latestCheckpointAtOrBefore(db, accountId, date) ?? earliestCheckpointAfter(db, accountId, date)
  );
}

/**
 * What the ledger predicts a checkpoint should have read, and by how much it
 * missed.
 *
 * `null` when there is no earlier checkpoint: the first one anchors the
 * account and has nothing to be measured against — transactions before it are
 * outside every balance by design.
 *
 * Computed on read and never stored, so adding the missing transaction later
 * clears the flag with no write to the checkpoint.
 */
export function checkpointDelta(
  db: FinanceDb,
  checkpoint: AccountCheckpointRow
): CheckpointDelta | null {
  const previous = latestCheckpointAtOrBefore(db, checkpoint.accountId, dayBefore(checkpoint.asOf));
  if (previous === undefined) return null;

  return measureAgainst(
    checkpoint,
    previous,
    sumThrough(db, checkpoint.accountId, checkpoint.asOf),
    sumThrough(db, checkpoint.accountId, previous.asOf)
  );
}

/**
 * The delta arithmetic itself, given both prefix sums — shared so the
 * one-account read and the batched one cannot drift into two answers.
 */
export function measureAgainst(
  checkpoint: AccountCheckpointRow,
  previous: AccountCheckpointRow,
  throughCheckpoint: number,
  throughPrevious: number
): CheckpointDelta {
  const expectedBalanceCents = previous.balanceCents + (throughCheckpoint - throughPrevious);
  return { expectedBalanceCents, deltaCents: checkpoint.balanceCents - expectedBalanceCents };
}

/**
 * True when the account's latest checkpoint disagrees with the ledger. See
 * {@link AccountBalance.inconsistent} for why only the latest one counts.
 */
export function isAccountInconsistent(db: FinanceDb, accountId: string): boolean {
  const latest = latestCheckpoint(db, accountId);
  if (latest === undefined) return false;
  return (checkpointDelta(db, latest)?.deltaCents ?? 0) !== 0;
}
