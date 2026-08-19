import { skipToken, useQuery } from '@tanstack/react-query';

import { isUnavailableError, unwrap } from '../../../purchases-api-helpers.js';
import { reconcileLinks } from '../../../purchases-api/index.js';

import type { LinkedPurchase } from './types.js';

/** Soft cross-pillar reference to a finance transaction (ADR-012, ADR-042). */
export function financeTransactionUri(id: string): string {
  return `pops://finance/transaction/${id}`;
}

export interface PurchasesForTransaction {
  entries: LinkedPurchase[];
  isLoading: boolean;
  error: Error | null;
  /** The pillar could not be reached or failed server-side, which is not the transaction's fault. */
  isUnavailable: boolean;
  refetch: () => void;
}

/**
 * The orders behind one transaction, read from the purchases pillar.
 *
 * `GET /reconcile/links` and deliberately not `GET /reconcile/queue`: the
 * queue holds charges still awaiting a decision, so a confirmed link has left
 * it and an auto-link source never entered it — which is exactly the pair of
 * states a finance view is asking about. A lookup built on the queue would
 * report "no purchase" wherever the relationship is most certain.
 *
 * `skipToken` while no transaction is selected, so mounting the transactions
 * page costs no cross-pillar traffic and no request is ever built around a
 * placeholder id.
 */
export function usePurchasesForTransaction(transactionId: string | null): PurchasesForTransaction {
  const query = useQuery({
    queryKey: ['purchases', 'reconcile', 'links', transactionId],
    queryFn:
      transactionId === null
        ? skipToken
        : async () =>
            unwrap(
              await reconcileLinks({
                query: { transactionUri: financeTransactionUri(transactionId) },
              })
            ),
  });

  return {
    entries: query.data?.purchases ?? [],
    isLoading: query.isPending && transactionId !== null,
    error: query.error instanceof Error ? query.error : null,
    isUnavailable: isUnavailableError(query.error),
    refetch: () => {
      void query.refetch();
    },
  };
}
