import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../purchases-api-helpers.js';
import { purchaseGet } from '../../purchases-api/index.js';

import type { PurchaseDetail } from './types.js';

/**
 * A union rather than one shape with everything optional, for the reason the
 * merchant lens gives: flat, a ready load carrying no order type-checks.
 *
 * `absent` is its own state and not a failure. A search hit, a bookmark or a
 * queue row can outlive the order it addresses — the pillar hard-deletes and
 * everything hanging off an order cascades — and "this order is gone" is a
 * different thing to tell a reader than "the request did not work". Only one
 * of the two is worth a retry button.
 */
export type PurchaseDetailModel =
  | { state: 'loading' }
  | { state: 'absent' }
  | { state: 'failed'; failure: Error; refetch: () => void }
  | { state: 'ready'; detail: PurchaseDetail; refetch: () => void };

const ORDER_IS_GONE = 404;

export function usePurchaseDetail(purchaseId: string): PurchaseDetailModel {
  const query = useQuery({
    queryKey: ['purchases', 'purchase', 'get', purchaseId],
    queryFn: async (): Promise<PurchaseDetail | null> => {
      const result = await purchaseGet({ path: { id: purchaseId } });
      if (result.response?.status === ORDER_IS_GONE) return null;
      return unwrap(result);
    },
    enabled: purchaseId !== '',
    retry: false,
  });

  const refetch = (): void => {
    void query.refetch();
  };

  if (purchaseId === '') return { state: 'absent' };
  if (query.isPending) return { state: 'loading' };
  if (query.error !== null) return { state: 'failed', failure: query.error, refetch };
  if (query.data === null) return { state: 'absent' };

  return { state: 'ready', detail: query.data, refetch };
}
