import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../finance-api-helpers.js';
import { checkpointsHistory } from '../../finance-api/index.js';

/** Months of trend the balance card charts. */
const TREND_MONTHS = 12;

/**
 * Month-end balances for one account.
 *
 * There is no matching `useAccountBalance`: the figure itself already rides on
 * every `GET /accounts` row (`account.balance`), which `useAccountDetailPage`
 * has in hand, so a second request for the same number would be a round trip
 * that buys nothing. The history is the one thing the list cannot answer.
 */
export function useBalanceHistory(accountId: string, months = TREND_MONTHS) {
  return useQuery({
    queryKey: ['finance', 'accounts', accountId, 'balance-history', months],
    queryFn: async () =>
      unwrap(await checkpointsHistory({ path: { id: accountId }, query: { months } })),
    enabled: accountId !== '',
  });
}
