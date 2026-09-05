/**
 * Handler for the `dataQuality.*` sub-router (POPS-2881, ADR-051).
 *
 * One nudge per account — never one per historical checkpoint. An account's
 * inconsistency is a statement about its LATEST checkpoint only
 * (`isAccountInconsistent`, `account-balance-anchor.ts`): an old flagged
 * checkpoint superseded by a consistent newer one has been re-anchored and is
 * no longer in question, so it contributes nothing here. Archived accounts
 * are excluded at the source (`listAccounts({ archived: false })`) rather
 * than filtered after, so an archived account's frozen history never even
 * reaches `checkpointDelta` — nor the staleness read (POPS-2890), which
 * shares the same account list.
 *
 * `balancesFor` answers "which accounts disagree with a checkpoint" for every
 * active account in three grouped queries, so only the accounts it flags pay
 * for the extra reads that produce the delta itself. A flagged account is
 * rare by nature — that is the whole point of the feed — so the cost is three
 * queries plus a handful, not four per account however many there are.
 *
 * The delta comes from `checkpointDelta` rather than being recomputed here,
 * because the feed needs the value and not just the boolean `balancesFor`
 * carries; two implementations of the same arithmetic could drift apart.
 *
 * An anchored balance is read as of today, and a checkpoint cannot be dated
 * in the future, so the anchor `balancesFor` picks is the account's latest
 * checkpoint — the one `inconsistent` is a statement about.
 */
import {
  accountCheckpointsService,
  accountsService,
  balancesFor,
  checkpointDelta,
  type AccountRow,
  type FinanceDb,
} from '../../db/index.js';
import {
  toCheckpointInconsistencyNudge,
  toStaleAccountNudge,
  type CheckpointInconsistencyNudge,
} from '../modules/data-quality-types.js';
import { staleAccounts } from '../modules/data-quality/stale-accounts.js';
import { runHttp } from './error-mapping.js';

/**
 * One account can have many checkpoints, but `listAccounts` has no built-in
 * cap for an internal read like this one (the wire's own `limit` query is
 * capped at 500 for a caller, not for this server-side rollup) — passing the
 * largest safe integer reads every active account in one call.
 */
const EVERY_ACTIVE_ACCOUNT = Number.MAX_SAFE_INTEGER;

function activeAccounts(db: FinanceDb): AccountRow[] {
  return accountsService.listAccounts(db, {
    archived: false,
    limit: EVERY_ACTIVE_ACCOUNT,
    offset: 0,
  }).rows;
}

function checkpointInconsistencyNudges(
  db: FinanceDb,
  accounts: readonly AccountRow[]
): CheckpointInconsistencyNudge[] {
  const balances = balancesFor(
    db,
    accounts.map((account) => account.id)
  );

  const nudges: CheckpointInconsistencyNudge[] = [];
  for (const account of accounts) {
    if (balances.get(account.id)?.inconsistent !== true) continue;

    const latest = accountCheckpointsService.latestCheckpoint(db, account.id);
    if (latest === undefined) continue;

    const delta = checkpointDelta(db, latest);
    if (delta === null || delta.deltaCents === 0) continue;

    nudges.push(toCheckpointInconsistencyNudge(account, latest, delta.deltaCents));
  }

  return nudges;
}

/**
 * Inconsistencies first, largest |delta| first; then stale accounts, most
 * overdue relative to their own cadence first. The two kinds have no common
 * unit to rank across, and a ledger that contradicts a bank statement is the
 * more urgent fact — a stale account is behind, an inconsistent one is wrong.
 */
export function makeDataQualityHandlers(db: FinanceDb) {
  return {
    nudges: () =>
      runHttp(() => {
        const accounts = activeAccounts(db);
        const inconsistencies = checkpointInconsistencyNudges(db, accounts).toSorted(
          (a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents)
        );
        const stale = staleAccounts(db, accounts).map(({ account, staleness }) =>
          toStaleAccountNudge(account, staleness)
        );
        return { status: 200 as const, body: { data: [...inconsistencies, ...stale] } };
      }),
  };
}
