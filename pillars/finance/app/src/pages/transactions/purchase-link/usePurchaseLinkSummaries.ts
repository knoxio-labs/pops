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

const FNV_PRIME = 0x01000193;
const FNV_OFFSETS = [0x811c9dc5, 0x9dc5811c] as const;

function fnv1a(ids: readonly string[], offset: number): number {
  let hash = offset;
  for (const id of ids) {
    for (let index = 0; index < id.length; index += 1) {
      hash = Math.imul(hash ^ id.charCodeAt(index), FNV_PRIME);
    }
    // A separator, so ['ab', 'c'] and ['a', 'bc'] are different lists.
    hash = Math.imul(hash ^ 0x1f, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * A fixed-size stand-in for the id list, for the query key.
 *
 * React Query re-derives a key's hash on every render, and this page holds the
 * whole transaction history while re-rendering on every keystroke in its
 * search box, so a key carrying the ids themselves would stringify tens of
 * thousands of them per keystroke. The count and two independent FNV-1a passes
 * change when the set changes — which is all the key has to do — and cost the
 * same to hash whatever the page is holding.
 */
export function fingerprint(transactionIds: readonly string[]): string {
  const [first, second] = FNV_OFFSETS;
  return `${transactionIds.length}:${fnv1a(transactionIds, first).toString(36)}:${fnv1a(transactionIds, second).toString(36)}`;
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

/** What the column knows: the answers it has, and whether it got one at all. */
export interface PurchaseLinkSummaries {
  /**
   * Keyed on transaction id. A transaction no order explains is absent, not
   * zeroed — and so is every transaction when `unavailable` is true, which is
   * why the two are not the same reading.
   */
  byTransactionId: Map<string, TransactionLinkSummary>;
  /**
   * The last lookup failed, so an empty map is not an answer about anything.
   *
   * Any failure counts, not only the unreachable-pillar ones
   * `isUnavailableError` picks out. That predicate exists to word the detail
   * panel's message, where the reader is asking about one transaction and the
   * blame matters. Here the reader is reading a whole column of blanks, and a
   * refusal the producer meant — a malformed URI in the batch, which it
   * answers by rejecting the request entire — blanks exactly as many rows as
   * an outage does.
   */
  unavailable: boolean;
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
 * Keyed on which transactions were asked about rather than on the transactions
 * query's cache timestamp: a tag edit invalidates the transactions list, and a
 * key that moved with every refetch would re-ask purchases about an unchanged
 * set of rows each time somebody edited one.
 *
 * `retry: false`, as everywhere else this app calls a service. A column is
 * decoration on a page that is fully useful without it, so a refusal draws no
 * indicators rather than failing the page; the reader who wants to know why
 * opens the row, where the panel says which side failed and offers the retry.
 * What a refusal must not do is pass for an answer, so it is reported out of
 * here rather than collapsed into the same empty map a fully unlinked page
 * produces.
 *
 * The failure is carried alongside whatever data survived rather than instead
 * of it: React Query keeps the previous answer when a refetch fails, and those
 * indicators are stale rather than wrong. The reader is told the column may be
 * incomplete either way.
 */
export function usePurchaseLinkSummaries(
  transactions: readonly { id: string }[] | undefined
): PurchaseLinkSummaries {
  const transactionIds = useMemo(
    () => (transactions ?? []).map((transaction) => transaction.id),
    [transactions]
  );
  const askedAbout = useMemo(() => fingerprint(transactionIds), [transactionIds]);
  const query = useQuery({
    retry: false,
    enabled: transactionIds.length > 0,
    queryKey: ['purchases', 'reconcile', 'links', 'batch', askedAbout],
    queryFn: async () => fetchSummaries(transactionIds),
  });

  const byTransactionId = useMemo(
    () =>
      new Map(
        (query.data ?? []).map((summary) => [transactionIdOf(summary.transactionUri), summary])
      ),
    [query.data]
  );

  return useMemo(
    () => ({ byTransactionId, unavailable: query.isError }),
    [byTransactionId, query.isError]
  );
}
