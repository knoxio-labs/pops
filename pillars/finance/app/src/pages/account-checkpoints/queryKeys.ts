/**
 * Query keys for one account's checkpoint-derived data (POPS-2888).
 *
 * `accountCheckpointsKey` backs this page's own list query.
 * `accountBalanceHistoryKey`'s prefix (`['finance', 'accounts', accountId,
 * 'balance-history']`) matches `useBalanceHistory`'s real key (POPS-2887,
 * `account-detail/useBalanceHistory.ts`), which appends `months` — React
 * Query treats a shorter key as a prefix match, so invalidating this one
 * also invalidates that. `accountBalanceKey` has no reader: POPS-2887 reads
 * the balance straight off `account.balance` on the accounts-list row rather
 * than a separate per-account query, which the `ACCOUNTS_KEY`/
 * `ALL_ACCOUNTS_KEY` invalidation in `useCheckpointMutations` already covers
 * — kept anyway in case a future per-account balance query needs it.
 */
export const accountCheckpointsKey = (accountId: string) =>
  ['finance', 'accounts', accountId, 'checkpoints'] as const;

export const accountBalanceKey = (accountId: string) =>
  ['finance', 'accounts', accountId, 'balance'] as const;

export const accountBalanceHistoryKey = (accountId: string) =>
  ['finance', 'accounts', accountId, 'balance-history'] as const;
