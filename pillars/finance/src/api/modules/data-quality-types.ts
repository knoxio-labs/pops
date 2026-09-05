/**
 * Wire mappers for the dashboard's data-quality nudge feed (POPS-2881, POPS-2890). The
 * zod schemas live in the REST contract (`src/contract/rest-data-quality-
 * schemas.ts`); this file keeps only the row → response projection and its
 * TS shape, the same split `checkpoints-types.ts` makes for checkpoints.
 */
import type { AccountCheckpointRow, AccountRow } from '../../db/index.js';

/** An account whose latest checkpoint disagrees with the ledger. */
export interface CheckpointInconsistencyNudge {
  kind: 'checkpoint-inconsistency';
  accountId: string;
  accountName: string;
  checkpointId: string;
  asOf: string;
  deltaCents: number;
  currency: string;
  href: string;
}

/** An account nobody has fed for longer than its own import rhythm. */
export interface StaleAccountNudge {
  kind: 'stale-account';
  accountId: string;
  accountName: string;
  newestTransactionDate: string;
  daysStale: number;
  thresholdDays: number;
  href: string;
}

/** One entry in the nudge feed. */
export type Nudge = CheckpointInconsistencyNudge | StaleAccountNudge;

export function toCheckpointInconsistencyNudge(
  account: AccountRow,
  checkpoint: AccountCheckpointRow,
  deltaCents: number
): CheckpointInconsistencyNudge {
  return {
    kind: 'checkpoint-inconsistency',
    accountId: account.id,
    accountName: account.name,
    checkpointId: checkpoint.id,
    asOf: checkpoint.asOf,
    deltaCents,
    currency: account.currency,
    href: `/accounts/${account.id}/checkpoints`,
  };
}

export function toStaleAccountNudge(
  account: AccountRow,
  staleness: { newestTransactionDate: string; daysStale: number; thresholdDays: number }
): StaleAccountNudge {
  return {
    kind: 'stale-account',
    accountId: account.id,
    accountName: account.name,
    ...staleness,
    href: `/accounts/${account.id}`,
  };
}
