import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../../finance-api-helpers.js';
import { transactionsGet } from '../../../finance-api/index.js';

export interface TransactionCounterpart {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  description: string;
}

/**
 * The other leg of a linked transfer, fetched by id.
 *
 * `enabled` gates both the network call and the disabled branch's `queryFn`,
 * so the `id === null` guard inside it can never actually run — it only
 * keeps the function total without a non-null assertion. Disabled (`id ===
 * null`) while a popover or confirm dialog is closed, so a table full of
 * linked rows costs one request per counterpart actually opened, not one per
 * row rendered.
 */
export function useTransactionCounterpart(id: string | null) {
  return useQuery({
    queryKey: ['finance', 'transactions', 'detail', id],
    queryFn: async (): Promise<TransactionCounterpart> => {
      if (id === null) throw new Error('useTransactionCounterpart: fetched while disabled');
      return unwrap(await transactionsGet({ path: { id } })).data;
    },
    enabled: id !== null,
    retry: false,
  });
}
