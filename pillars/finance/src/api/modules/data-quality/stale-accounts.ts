/**
 * Which accounts are stale, by their own measure (POPS-2890).
 *
 * The threshold is not a global number. It is the account's own import
 * rhythm — the median gap between its last five batches, as `importStatusFor`
 * already measures it for the imports page — and only when the account has
 * fewer than three batches does the 45-day fallback apply. An account is
 * stale when its NEWEST TRANSACTION is older than that: a sync that ran
 * yesterday and wrote nothing has not caught the ledger up, so the last
 * import date is the wrong clock.
 *
 * An account with no transactions at all is not stale, it is unstarted, and
 * a person ledger is never stale — nothing feeds it but the two people in it.
 * Archived accounts never reach here; the caller lists active ones.
 */
import { importStatusFor, today, type AccountRow, type FinanceDb } from '../../../db/index.js';

export const STALE_FALLBACK_THRESHOLD_DAYS = 45;

const MS_PER_DAY = 86_400_000;

export interface AccountStaleness {
  newestTransactionDate: string;
  daysStale: number;
  thresholdDays: number;
}

export interface StaleAccount {
  account: AccountRow;
  staleness: AccountStaleness;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

const overdueRatio = (s: AccountStaleness): number => s.daysStale / s.thresholdDays;

/** Stale accounts among `accounts`, most overdue relative to their own threshold first. */
export function staleAccounts(
  db: FinanceDb,
  accounts: readonly AccountRow[],
  asOf: string = today()
): StaleAccount[] {
  const candidates = accounts.filter((account) => account.kind !== 'person');
  const statuses = importStatusFor(
    db,
    candidates.map((account) => account.id)
  );
  const stale: StaleAccount[] = [];
  for (const account of candidates) {
    const status = statuses.get(account.id);
    const newest = status?.newestTransactionDate ?? null;
    if (newest === null) continue;
    const thresholdDays = status?.cadenceDays ?? STALE_FALLBACK_THRESHOLD_DAYS;
    const daysStale = daysBetween(newest, asOf);
    if (daysStale <= thresholdDays) continue;
    stale.push({ account, staleness: { newestTransactionDate: newest, daysStale, thresholdDays } });
  }
  return stale.toSorted((a, b) => overdueRatio(b.staleness) - overdueRatio(a.staleness));
}
