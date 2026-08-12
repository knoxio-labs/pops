import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../purchases-api-helpers.js';
import { reconcileQueue } from '../../purchases-api/index.js';

import type { QueueEntry, QueueFilterState } from './types.js';

/**
 * Prefix every reconcile-queue query shares, so a decision can invalidate all
 * of them without knowing which filters are currently applied.
 */
export const RECONCILE_QUEUE_QUERY_KEY = ['purchases', 'reconcile', 'queue'] as const;

/**
 * The server's own default page size.
 *
 * Nothing pages past it. The queue drains as charges are confirmed — a
 * confirmed link stops being a proposal, so the entry leaves the queue and the
 * next read pulls the following ones up — which makes an offset cursor over a
 * shrinking list the wrong shape. The view says when it is truncated instead
 * of pretending it is showing everything.
 */
export const QUEUE_PAGE_SIZE = 50;

export interface ReconcileQueueResult {
  entries: QueueEntry[];
  isLoading: boolean;
  error: Error | null;
  /** The read filled the page, so the server is holding more than is shown. */
  isTruncated: boolean;
  refetch: () => void;
}

export function useReconcileQueue(filters: QueueFilterState): ReconcileQueueResult {
  const query = useQuery({
    queryKey: [...RECONCILE_QUEUE_QUERY_KEY, filters],
    queryFn: async () =>
      unwrap(
        await reconcileQueue({
          query: {
            ...(filters.kind === 'all' ? {} : { kind: filters.kind }),
            includeAuto: filters.includeAuto,
            limit: QUEUE_PAGE_SIZE,
          },
        })
      ),
  });

  const entries = query.data?.items ?? [];

  return {
    entries,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    isTruncated: entries.length >= QUEUE_PAGE_SIZE,
    refetch: () => {
      void query.refetch();
    },
  };
}
