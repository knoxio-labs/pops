/**
 * What an account holds, and whether the ledger agrees with the world
 * (POPS-2879, ADR-051).
 *
 * One function is the truth about a balance and everything else reads it: the
 * accounts grid, the account page, the loan repayment split, the merge
 * preview, the mobile gateway, the MCP tools. Before this module there were
 * two ad-hoc sums of `transactions.amount_cents`, both of which answer "net
 * flow since the file started" rather than "what is in the account" — which is
 * why Amex read -$18,565.36 and the ANZ credit card read POSITIVE $780.64.
 *
 * A balance is the nearest checkpoint plus the transactions between it and the
 * date asked for. Both anchored directions collapse to one expression:
 *
 * ```
 * balance(date) = anchor.balance + Σ(tx.date <= date) - Σ(tx.date <= anchor.asOf)
 * ```
 *
 * Forward (the anchor is behind the date) that adds the transactions since the
 * checkpoint; backward (the anchor is ahead of it) the same subtraction runs
 * the other way and unwinds them. Deriving BACKWARDS is what makes a
 * twelve-month trend truthful for the months before the first checkpoint —
 * they are anchored too, just from the far side.
 *
 * Every figure here is ledger-signed: positive is money held, negative is
 * money owed, for assets and liabilities alike.
 */
import { and, eq, lte, sql, sum } from 'drizzle-orm';

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

/** One point on a balance trend. */
export interface BalancePoint {
  /** `YYYY-MM`. The balance is that month's last day, end of day. */
  month: string;
  balanceCents: number;
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

/** Last day of `month` (`YYYY-MM`) as ISO `YYYY-MM-DD`. */
function monthEnd(month: string): string {
  const [year, monthOfYear] = month.split('-').map(Number);
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year ?? 0, monthOfYear ?? 1, 0)).toISOString().slice(0, 10);
}

/** `YYYY-MM`, `offset` months before the month `from` falls in. */
function monthBefore(from: string, offset: number): string {
  const [year, monthOfYear] = from.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (monthOfYear ?? 1) - 1 - offset, 1))
    .toISOString()
    .slice(0, 7);
}

/** Σ `amountCents` for every transaction dated at or before `date`, inclusive. */
function sumThrough(db: FinanceDb, accountId: string, date: string): number {
  const row = db
    .select({ total: sum(transactions.amountCents) })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), lte(transactions.date, date)))
    .get();
  return Number(row?.total ?? 0);
}

function toAnchor(checkpoint: AccountCheckpointRow): BalanceAnchor {
  return { checkpointId: checkpoint.id, asOf: checkpoint.asOf, source: checkpoint.source };
}

/**
 * The checkpoint to anchor `date` on: the nearest one at or before it, else
 * the earliest one after it, else none.
 */
function anchorFor(
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

  const between =
    sumThrough(db, checkpoint.accountId, checkpoint.asOf) -
    sumThrough(db, checkpoint.accountId, previous.asOf);
  const expectedBalanceCents = previous.balanceCents + between;
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

/**
 * An account's balance at the end of `date`, anchored on the nearest
 * checkpoint either side of it.
 *
 * With no checkpoint at all the number is a plain sum — net flow since
 * whenever the import happened to start — and `basis` says so rather than
 * letting it pass for a balance.
 */
export function balanceAsOf(
  db: FinanceDb,
  accountId: string,
  date: string = today()
): AccountBalance {
  const checkpoint = anchorFor(db, accountId, date);
  const inconsistent = isAccountInconsistent(db, accountId);
  const through = sumThrough(db, accountId, date);

  if (checkpoint === undefined) {
    return { balanceCents: through, asOf: date, basis: 'transactions', anchor: null, inconsistent };
  }

  return {
    balanceCents: checkpoint.balanceCents + through - sumThrough(db, accountId, checkpoint.asOf),
    asOf: date,
    basis: 'checkpoint',
    anchor: toAnchor(checkpoint),
    inconsistent,
  };
}

/**
 * Month-end balances, oldest first, ending with the month `endingAt` falls in.
 *
 * The transaction side is one grouped query rather than one per month: SQLite
 * returns a row per month the account moved in, and a running total over those
 * rows gives `Σ(tx.date <= monthEnd)` for every month at once. Only the anchor
 * prefix sums are read individually, and there are at most as many of those as
 * the account has checkpoints.
 */
export function balanceHistory(
  db: FinanceDb,
  accountId: string,
  months = 12,
  endingAt: string = today()
): BalancePoint[] {
  const monthColumn = sql<string>`substr(${transactions.date}, 1, 7)`;
  const monthlyTotals = db
    .select({ month: monthColumn, total: sum(transactions.amountCents) })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .groupBy(monthColumn)
    .orderBy(monthColumn)
    .all();

  const wanted = Array.from({ length: months }, (_, index) =>
    monthBefore(endingAt, months - 1 - index)
  );

  const anchorPrefix = new Map<string, number>();
  const prefixThrough = (date: string): number => {
    const cached = anchorPrefix.get(date);
    if (cached !== undefined) return cached;
    const computed = sumThrough(db, accountId, date);
    anchorPrefix.set(date, computed);
    return computed;
  };

  // `wanted` is ascending and `monthlyTotals` is ordered, so one pointer walks
  // both: a month the account never moved in carries the running total
  // forward rather than reading zero.
  let cursor = 0;
  let through = 0;
  return wanted.map((month) => {
    while (cursor < monthlyTotals.length && (monthlyTotals[cursor]?.month ?? '') <= month) {
      through += Number(monthlyTotals[cursor]?.total ?? 0);
      cursor += 1;
    }
    const checkpoint = anchorFor(db, accountId, monthEnd(month));
    return {
      month,
      balanceCents:
        checkpoint === undefined
          ? through
          : checkpoint.balanceCents + through - prefixThrough(checkpoint.asOf),
    };
  });
}
