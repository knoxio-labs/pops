import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../purchases-api-helpers.js';
import { purchaseList } from '../../purchases-api/index.js';
import { merchantOrdersQuery } from './merchant-orders-query.js';

import type { MerchantOrder, MerchantSpend, SpendPeriod } from './types.js';

export type MerchantOrdersModel =
  | { state: 'loading' }
  | { state: 'failed'; failure: Error; refetch: () => void }
  | {
      state: 'ready';
      orders: MerchantOrder[];
      /**
       * How many orders the row said it had, to be read against how many came
       * back. Equal is the ordinary case; any other reading is named on
       * screen rather than left as a list that silently disagrees with the
       * headline above it.
       */
      counted: number;
    };

/**
 * The orders behind one merchant row.
 *
 * The query object is the cache key as well as the request, so two rows of
 * the same merchant in different currencies — or the same row read over two
 * periods — never share an answer.
 */
export function useMerchantOrders(
  merchant: MerchantSpend,
  period: SpendPeriod
): MerchantOrdersModel {
  const query = merchantOrdersQuery(merchant, period);
  const request = useQuery({
    queryKey: ['purchases', 'merchantOrders', query],
    queryFn: async () => unwrap(await purchaseList({ query })),
    retry: false,
  });

  const refetch = (): void => {
    void request.refetch();
  };

  if (request.isPending) return { state: 'loading' };
  if (request.error !== null) return { state: 'failed', failure: request.error, refetch };

  return { state: 'ready', orders: request.data.items, counted: merchant.orderCount };
}
