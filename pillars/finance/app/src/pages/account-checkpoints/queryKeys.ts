/**
 * Query keys for one account's checkpoint-derived data (POPS-2888).
 *
 * `accountCheckpointsKey` backs this page's own list query. The balance and
 * balance-history keys have no reader yet — POPS-2887's real balance card is
 * in flight in parallel and does not exist on this branch — but every
 * mutation here invalidates them anyway, on the same naming scheme
 * (`['finance', 'accounts', accountId, <resource>]`) that card is expected to
 * adopt, so it picks up a fresh number without a reload once it queries
 * under these keys instead of needing its own invalidation pass.
 */
export const accountCheckpointsKey = (accountId: string) =>
  ['finance', 'accounts', accountId, 'checkpoints'] as const;

export const accountBalanceKey = (accountId: string) =>
  ['finance', 'accounts', accountId, 'balance'] as const;

export const accountBalanceHistoryKey = (accountId: string) =>
  ['finance', 'accounts', accountId, 'balance-history'] as const;
