/**
 * Everything that answers "what is this account worth, and as of when":
 * derived balances, balance history, the checkpoint table, and the anchor
 * arithmetic that reconciles the two.
 *
 * One of the groups re-exported by `../index.ts` — see that file's header for
 * why the barrel is split rather than flat.
 */
export { balanceHistory, type BalancePoint } from '../services/account-balance-history.js';

export { balanceAsOf, balancesFor } from '../services/account-balance.js';

export { transactionCountsFor } from '../services/account-transaction-count.js';

export {
  checkpointDelta,
  dayBefore,
  isAccountInconsistent,
  today,
  type AccountBalance,
  type BalanceAnchor,
  type BalanceBasis,
  type CheckpointDelta,
} from '../services/account-balance-anchor.js';

export * as accountCheckpointsService from '../services/account-checkpoints.js';

export type {
  AccountCheckpointRow,
  InsertCheckpointInput,
} from '../services/account-checkpoints.js';

export { isCheckpointConflict } from '../services/checkpoint-conflict.js';
