import { skipToken, useQuery } from '@tanstack/react-query';

import { isUnavailableError, unwrap } from '../../../purchases-api-helpers.js';
import { reconcileLinks } from '../../../purchases-api/index.js';

import type { LinkedPurchase } from './types.js';

/** Soft cross-pillar reference to a finance transaction (ADR-012, ADR-042). */
export function financeTransactionUri(id: string): string {
  return `pops://finance/transaction/${id}`;
}

/**
 * The producer caps `GET /reconcile/links`' `limit` at 500, and
 * `links-page-size.test.ts` holds this number against the `maximum` in the
 * vendored snapshot rather than against a comment — the same pattern
 * `TRANSACTION_URI_BATCH_SIZE` uses for the batch route. Requesting the
 * producer's own maximum keeps a full settlement history to the fewest
 * possible round trips; requesting past it is a 400 the schema enforces
 * before the service ever clamps.
 */
export const LINKS_PAGE_SIZE = 500;

/**
 * Every order behind `transactionUri`, walking `limit`/`offset` pages until
 * one comes back short.
 *
 * `GET /reconcile/links` pages orders, not raw charge rows, so a page
 * boundary never splits a combined settlement's charges — a short last page
 * is unambiguous. A transaction settling more than one page of orders is rare
 * today but not impossible, and a caller that only read the first page would
 * silently drop the rest with no signal that anything was missing.
 */
async function fetchAllLinkedPurchases(transactionUri: string): Promise<LinkedPurchase[]> {
  const purchases: LinkedPurchase[] = [];
  let offset = 0;
  for (;;) {
    const page = unwrap(
      await reconcileLinks({ query: { transactionUri, limit: LINKS_PAGE_SIZE, offset } })
    );
    purchases.push(...page.purchases);
    if (page.purchases.length < LINKS_PAGE_SIZE) break;
    offset += LINKS_PAGE_SIZE;
  }
  return purchases;
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
 *
 * `retry: false`, as everywhere else this app calls a service: the shell's
 * client leaves react-query's three retries in place, which would replay a
 * deterministic refusal at another pillar three times and hold the skeleton up
 * for seconds before an outage is admitted. The notice offers the retry
 * instead, at a moment the reader chose.
 */
export function usePurchasesForTransaction(transactionId: string | null): PurchasesForTransaction {
  const query = useQuery({
    retry: false,
    queryKey: ['purchases', 'reconcile', 'links', transactionId],
    queryFn:
      transactionId === null
        ? skipToken
        : async () => ({
            purchases: await fetchAllLinkedPurchases(financeTransactionUri(transactionId)),
          }),
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
