import type { QueueEntry } from '@/fixtures/purchases-queue';

import type { QueueFilterState } from './types';

/**
 * What the real `/reconcile/queue` endpoint does with `kind` and
 * `includeAuto`, applied client-side over the fixture set since the
 * playground has no server to send the query to.
 */
export function filterQueueEntries(
  entries: readonly QueueEntry[],
  filters: QueueFilterState
): QueueEntry[] {
  return entries.filter((entry) => {
    if (!filters.includeAuto && entry.autoLinkedSource) return false;
    if (filters.kind === 'proposed') return entry.proposed.length > 0;
    if (filters.kind === 'unexplained') return entry.proposed.length === 0;
    return true;
  });
}
