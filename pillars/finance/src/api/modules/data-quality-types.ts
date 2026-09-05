/**
 * Wire mapper for the dashboard's data-quality nudge feed (POPS-2881). The
 * zod schemas live in the REST contract (`src/contract/rest-data-quality-
 * schemas.ts`); this file keeps only the row → response projection and its
 * TS shape, the same split `checkpoints-types.ts` makes for checkpoints.
 */
import type { AccountRow } from '../../db/index.js';
import type { AccountCheckpointRow } from '../../db/services/account-checkpoints.js';

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

/** One entry in the nudge feed. A union of one member today. */
export type Nudge = CheckpointInconsistencyNudge;

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
