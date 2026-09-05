/**
 * What an account holds (POPS-2879, ADR-051).
 *
 * One function is the truth about a balance and everything else reads it: the
 * accounts grid, the account page, the loan repayment split, the merge
 * preview, the mobile gateway, the MCP tools. Before this module there were
 * two ad-hoc sums of `transactions.amount_cents`, both of which answer "net
 * flow since the file started" rather than "what is in the account" — which is
 * why Amex read -$18,565.36 and the ANZ credit card read POSITIVE $780.64.
 *
 * The anchoring rule itself lives in `account-balance-anchor.ts`; this is the
 * reading built on it, for one account and for a page of them.
 */
import { and, desc, eq, inArray, lte, sum } from 'drizzle-orm';

import { accountCheckpoints, transactions } from '../schema.js';
import { measureAgainst, toAnchor, today } from './account-balance-anchor.js';

import type { AccountBalance } from './account-balance-anchor.js';
import type { AccountCheckpointRow } from './account-checkpoints.js';
import type { FinanceDb } from './internal.js';

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
  return (
    balancesFor(db, [accountId], date).get(accountId) ?? assemble(EMPTY_PLAN, 0, date, new Map())
  );
}

/**
 * The same reading for many accounts at once, in three grouped queries rather
 * than a handful per account — what the accounts list and the mobile gateway
 * need, and the reason `balanceAsOf` is a thin wrapper over this rather than
 * a second implementation that could drift from it.
 *
 * The three: every checkpoint the accounts carry (a small table, and having
 * all of them in hand is what lets the anchor, the latest and the one before
 * it be chosen without another round trip); the transaction sum per account
 * through `date`; and the sum through each checkpoint that some account is
 * about to be measured against, keyed by checkpoint rather than by account so
 * one query serves both the anchor and the inconsistency check.
 *
 * Accounts with no rows at all still come back — with a zero balance on a
 * `transactions` basis, which is the truth about them.
 */
export function balancesFor(
  db: FinanceDb,
  accountIds: string[],
  date: string = today()
): Map<string, AccountBalance> {
  if (accountIds.length === 0) return new Map();

  const checkpointsByAccount = groupCheckpoints(db, accountIds);
  const plans = new Map(
    accountIds.map((accountId) => [
      accountId,
      planFor(checkpointsByAccount.get(accountId) ?? [], date),
    ])
  );
  const throughDate = sumsThroughDate(db, accountIds, date);
  const throughCheckpoint = sumsThroughCheckpoints(db, [...plans.values()].flatMap(measuredIn));

  return new Map(
    accountIds.map((accountId) => [
      accountId,
      assemble(
        plans.get(accountId) ?? EMPTY_PLAN,
        throughDate.get(accountId) ?? 0,
        date,
        throughCheckpoint
      ),
    ])
  );
}

/**
 * Which of an account's checkpoints matter for one reading: the one that
 * anchors `date`, and the pair the inconsistency flag is read off.
 *
 * `rows` is newest first, so the anchor at or before the date is the first one
 * not after it — and when every checkpoint is later than the date, the last
 * (earliest) one is what a backward derivation anchors on.
 */
interface BalancePlan {
  anchor: AccountCheckpointRow | undefined;
  latest: AccountCheckpointRow | undefined;
  previous: AccountCheckpointRow | undefined;
}

const EMPTY_PLAN: BalancePlan = { anchor: undefined, latest: undefined, previous: undefined };

function planFor(rows: AccountCheckpointRow[], date: string): BalancePlan {
  const latest = rows[0];
  return {
    anchor: rows.find((row) => row.asOf <= date) ?? rows.at(-1),
    latest,
    previous: latest === undefined ? undefined : rows.find((row) => row.asOf < latest.asOf),
  };
}

/** Every checkpoint a plan needs a prefix sum for, duplicates and all. */
function measuredIn(plan: BalancePlan): AccountCheckpointRow[] {
  return [plan.anchor, plan.latest, plan.previous].filter(
    (row): row is AccountCheckpointRow => row !== undefined
  );
}

function assemble(
  plan: BalancePlan,
  through: number,
  date: string,
  throughCheckpoint: Map<string, number>
): AccountBalance {
  const { anchor, latest, previous } = plan;
  const inconsistent =
    latest !== undefined &&
    previous !== undefined &&
    measureAgainst(
      latest,
      previous,
      throughCheckpoint.get(latest.id) ?? 0,
      throughCheckpoint.get(previous.id) ?? 0
    ).deltaCents !== 0;

  if (anchor === undefined) {
    return { balanceCents: through, asOf: date, basis: 'transactions', anchor: null, inconsistent };
  }
  return {
    balanceCents: anchor.balanceCents + through - (throughCheckpoint.get(anchor.id) ?? 0),
    asOf: date,
    basis: 'checkpoint',
    anchor: toAnchor(anchor),
    inconsistent,
  };
}

/** `Σ(tx.date <= date)` per account, in one grouped query. */
function sumsThroughDate(db: FinanceDb, accountIds: string[], date: string): Map<string, number> {
  return new Map(
    db
      .select({ accountId: transactions.accountId, total: sum(transactions.amountCents) })
      .from(transactions)
      .where(and(inArray(transactions.accountId, accountIds), lte(transactions.date, date)))
      .groupBy(transactions.accountId)
      .all()
      .map((row) => [row.accountId, Number(row.total ?? 0)])
  );
}

/** Every checkpoint the given accounts carry, newest first within each. */
function groupCheckpoints(
  db: FinanceDb,
  accountIds: string[]
): Map<string, AccountCheckpointRow[]> {
  const grouped = new Map<string, AccountCheckpointRow[]>();
  const rows = db
    .select()
    .from(accountCheckpoints)
    .where(inArray(accountCheckpoints.accountId, accountIds))
    .orderBy(desc(accountCheckpoints.asOf), desc(accountCheckpoints.createdAt))
    .all();
  for (const row of rows) {
    const existing = grouped.get(row.accountId);
    if (existing === undefined) grouped.set(row.accountId, [row]);
    else existing.push(row);
  }
  return grouped;
}

/**
 * `Σ(tx.date <= checkpoint.asOf)` for each given checkpoint, keyed by
 * checkpoint id. One query joining each checkpoint to its own account's
 * transactions, so a page of accounts costs one round trip rather than one
 * per anchor.
 */
function sumsThroughCheckpoints(
  db: FinanceDb,
  checkpoints: AccountCheckpointRow[]
): Map<string, number> {
  const sums = new Map<string, number>();
  const ids = [...new Set(checkpoints.map((row) => row.id))];
  if (ids.length === 0) return sums;

  const rows = db
    .select({ checkpointId: accountCheckpoints.id, total: sum(transactions.amountCents) })
    .from(accountCheckpoints)
    .leftJoin(
      transactions,
      and(
        eq(transactions.accountId, accountCheckpoints.accountId),
        lte(transactions.date, accountCheckpoints.asOf)
      )
    )
    .where(inArray(accountCheckpoints.id, ids))
    .groupBy(accountCheckpoints.id)
    .all();

  for (const row of rows) sums.set(row.checkpointId, Number(row.total ?? 0));
  return sums;
}
