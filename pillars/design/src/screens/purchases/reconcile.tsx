import { allProposedQueue, fullQueuePage, purchasesQueue } from '@/fixtures/purchases-queue';
import { useQueueCursor } from '@/kit/purchases/reconcile/cursor';
import { useQueueDecisions } from '@/kit/purchases/reconcile/decisions';
import { filterQueueEntries } from '@/kit/purchases/reconcile/filter';
import { QueueContent } from '@/kit/purchases/reconcile/queue-content';
import { QueueFilters } from '@/kit/purchases/reconcile/queue-filters';
import { DEFAULT_QUEUE_FILTERS } from '@/kit/purchases/reconcile/types';
import { RetryableError } from '@/kit/purchases/retryable-error';
import { useState } from 'react';

import { PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { QueueEntry } from '@/fixtures/purchases-queue';
import type { DecisionOutcome } from '@/kit/purchases/reconcile/decisions';
import type { QueueFilterState } from '@/kit/purchases/reconcile/types';
import type { ReactElement } from 'react';

export const meta: ScreenMeta = { title: 'Reconcile queue', order: 1, frame: 'web' };

/** The server's own default, which the read takes rather than asking for one. */
const QUEUE_PAGE_SIZE = 50;

interface ReconcileQueuePageProps {
  allEntries?: QueueEntry[];
  isLoading?: boolean;
  error?: string | null;
  /**
   * How many charges came back. The read takes the server's page size and
   * says when the page came back full; there is no offset cursor, because
   * confirming drains the queue from under it.
   */
  limit?: number;
  initialChargeId?: string;
  /** A decision the server refused, which the surface has no way to produce. */
  lastOutcome?: DecisionOutcome;
  /** The states view renders every case at once; only the default owns the page's focus. */
  autoFocus?: boolean;
  /** The filter selection to open with. Defaults to the server's own default, "All". */
  initialFilters?: QueueFilterState;
  /** A decision on the active entry that has not resolved yet. */
  isPending?: boolean;
}

/** `/purchases` — the reconciliation queue, ported for design review. */
export function ReconcileQueuePage({
  allEntries = purchasesQueue,
  isLoading = false,
  error = null,
  limit = QUEUE_PAGE_SIZE,
  initialChargeId,
  lastOutcome,
  autoFocus = true,
  initialFilters,
  isPending = false,
}: ReconcileQueuePageProps): ReactElement {
  const [entries, setEntries] = useState(allEntries);
  const [filters, setFilters] = useState<QueueFilterState>(
    initialFilters ?? { ...DEFAULT_QUEUE_FILTERS }
  );

  const matched = filterQueueEntries(entries, filters);
  const visible = matched.slice(0, limit);
  const isTruncated = matched.length > limit;

  const cursor = useQueueCursor(visible, initialChargeId ?? null);
  const decisions = useQueueDecisions(entries, setEntries, cursor.skipPast);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Reconcile"
        description="Match purchase charges against the finance transactions that paid for them."
      />

      <QueueFilters value={filters} onChange={setFilters} />

      {error !== null ? (
        <RetryableError
          title="Could not load the reconcile queue"
          message={error}
          retryLabel="Retry"
          onRetry={() => undefined}
        />
      ) : (
        <QueueContent
          visible={visible}
          hasUnfilteredEntries={entries.length > 0}
          isLoading={isLoading}
          isTruncated={isTruncated}
          limit={limit}
          cursor={cursor}
          decisions={decisions}
          lastOutcome={lastOutcome}
          autoFocus={autoFocus}
          isPending={isPending}
        />
      )}
    </div>
  );
}

export const states: ScreenStates = {
  loading: () => <ReconcileQueuePage isLoading autoFocus={false} />,
  error: () => (
    <ReconcileQueuePage error="The reconcile queue took too long to respond." autoFocus={false} />
  ),
  empty: () => <ReconcileQueuePage allEntries={[]} autoFocus={false} />,
  truncated: () => (
    <ReconcileQueuePage allEntries={fullQueuePage(QUEUE_PAGE_SIZE + 12)} autoFocus={false} />
  ),
  'decision-failed': () => (
    <ReconcileQueuePage
      autoFocus={false}
      lastOutcome={{
        status: 'failed',
        kind: 'accept',
        message: 'the finance pillar did not answer, so nothing was pinned',
      }}
    />
  ),
  'row-selected': () => (
    <ReconcileQueuePage initialChargeId="chg_01K5Q3F7Y2W9J3HNRK6BMS" autoFocus={false} />
  ),
  'filter-applied': () => (
    <ReconcileQueuePage
      initialFilters={{ kind: 'proposed', includeAuto: false }}
      autoFocus={false}
    />
  ),
  'filter-empty': () => (
    <ReconcileQueuePage
      allEntries={allProposedQueue}
      initialFilters={{ kind: 'unexplained', includeAuto: false }}
      autoFocus={false}
    />
  ),
  'auto-linked-visible': () => (
    <ReconcileQueuePage
      initialFilters={{ kind: 'all', includeAuto: true }}
      initialChargeId="chg_01K5Q4K9M1P4D6P8SXV2QJ"
      autoFocus={false}
    />
  ),
  'decision-pending': () => (
    <ReconcileQueuePage initialChargeId="chg_01K5Q1XN4E7K2M9V3ZB6TY" isPending autoFocus={false} />
  ),
};

export default function ReconcileQueueScreen(): ReactElement {
  return <ReconcileQueuePage />;
}
