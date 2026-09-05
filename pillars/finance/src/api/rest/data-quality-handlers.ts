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
 * reaches `checkpointDelta`.
 *
 * Reuses `checkpointDelta` directly rather than `isAccountInconsistent`
 * (which only reports the boolean) because the feed needs the delta value
 * itself — recomputing it a second way would risk the two ever disagreeing.
 */
import {
  accountCheckpointsService,
  accountsService,
  checkpointDelta,
  type FinanceDb,
} from '../../db/index.js';
import { toCheckpointInconsistencyNudge, type Nudge } from '../modules/data-quality-types.js';
import { runHttp } from './error-mapping.js';

/**
 * One account can have many checkpoints, but `listAccounts` has no built-in
 * cap for an internal read like this one (the wire's own `limit` query is
 * capped at 500 for a caller, not for this server-side rollup) — passing the
 * largest safe integer reads every active account in one call.
 */
const EVERY_ACTIVE_ACCOUNT = Number.MAX_SAFE_INTEGER;

function checkpointInconsistencyNudges(db: FinanceDb): Nudge[] {
  const { rows: accounts } = accountsService.listAccounts(db, {
    archived: false,
    limit: EVERY_ACTIVE_ACCOUNT,
    offset: 0,
  });

  const nudges: Nudge[] = [];
  for (const account of accounts) {
    const latest = accountCheckpointsService.latestCheckpoint(db, account.id);
    if (latest === undefined) continue;

    const delta = checkpointDelta(db, latest);
    if (delta === null || delta.deltaCents === 0) continue;

    nudges.push(toCheckpointInconsistencyNudge(account, latest, delta.deltaCents));
  }

  return nudges;
}

export function makeDataQualityHandlers(db: FinanceDb) {
  return {
    nudges: () =>
      runHttp(() => {
        const data = checkpointInconsistencyNudges(db).toSorted(
          (a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents)
        );
        return { status: 200 as const, body: { data } };
      }),
  };
}
