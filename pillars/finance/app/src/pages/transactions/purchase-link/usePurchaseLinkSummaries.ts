import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../../purchases-api-helpers.js';
import { reconcileLinksBatch } from '../../../purchases-api/index.js';
import { financeTransactionUri } from '../purchase-detail/usePurchasesForTransaction.js';

import type { TransactionLinkSummary } from './types.js';

/**
 * The producer caps `transactionUris` at 500 per request, and
 * `batch-size.test.ts` holds this number against the `maxItems` in the
 * vendored snapshot rather than against a comment. Lowering it is safe;
 * raising it past the producer's cap turns the whole column into a 400.
 */
export const TRANSACTION_URI_BATCH_SIZE = 500;

function chunk(ids: readonly string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push([...ids.slice(index, index + size)]);
  }
  return chunks;
}

function transactionIdOf(transactionUri: string): string {
  return transactionUri.slice(transactionUri.lastIndexOf('/') + 1);
}

async function fetchSummaries(
  transactionIds: readonly string[]
): Promise<TransactionLinkSummary[]> {
  const pages = await Promise.all(
    chunk(transactionIds, TRANSACTION_URI_BATCH_SIZE).map(async (ids) =>
      unwrap(
        await reconcileLinksBatch({
          body: { transactionUris: ids.map((id) => financeTransactionUri(id)) },
        })
      )
    )
  );
  return pages.flatMap((page) => page.transactions);
}

/**
 * Which of the given transactions an order explains, keyed on transaction id,
 * in one round trip per 500 of them.
 *
 * `GET /reconcile/links` answers one transaction and is what the detail panel
 * opens; asking it per row is a cross-pillar request per row, which is why
 * this table had no such column. The plural form answers the narrower question
 * a column can draw — how many orders, how many links confirmed, how many
 * merely derived — so a whole page costs a handful of requests whatever it
 * holds.
 *
 * A transaction no order explains is **absent** from the map, exactly as it is
 * absent from the producer's answer, so nothing here translates a zero into a
 * blank.
 *
 * Keyed on the ids themselves rather than on the transactions query's cache
 * timestamp: a tag edit invalidates the transactions list, and a key that
 * moved with every refetch would re-ask purchases about an unchanged set of
 * rows each time somebody edited one.
 *
 * `retry: false`, as everywhere else this app calls a service — and the
 * failure goes no further than this hook. A column is decoration on a page
 * that is fully useful without it, so a refusal draws no indicators rather
 * than failing the page; the reader who wants to know why opens the row, where
 * the panel says which side failed and offers the retry.
 */
export function usePurchaseLinkSummaries(
  transactions: readonly { id: string }[] | undefined
): Map<string, TransactionLinkSummary> {
  const transactionIds = useMemo(
    () => (transactions ?? []).map((transaction) => transaction.id),
    [transactions]
  );
  const query = useQuery({
    retry: false,
    enabled: transactionIds.length > 0,
    queryKey: ['purchases', 'reconcile', 'links', 'batch', transactionIds],
    queryFn: async () => fetchSummaries(transactionIds),
  });

  return new Map(
    (query.data ?? []).map((summary) => [transactionIdOf(summary.transactionUri), summary])
  );
}
