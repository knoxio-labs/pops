import { purchasesQueue } from '@/fixtures/purchases-queue';
import { EmptyPanel } from '@/kit/purchases/empty-panel';
import { useQueueCursor } from '@/kit/purchases/reconcile/cursor';
import { DecisionBar } from '@/kit/purchases/reconcile/decision-bar';
import { useQueueDecisions } from '@/kit/purchases/reconcile/decisions';
import { filterQueueEntries } from '@/kit/purchases/reconcile/filter';
import { QueueFilters } from '@/kit/purchases/reconcile/queue-filters';
import { QueueList } from '@/kit/purchases/reconcile/queue-list';
import { DEFAULT_QUEUE_FILTERS } from '@/kit/purchases/reconcile/types';
import { RetryableError } from '@/kit/purchases/retryable-error';
import { useState } from 'react';

import { PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { QueueEntry } from '@/fixtures/purchases-queue';
import type { QueueCursor } from '@/kit/purchases/reconcile/cursor';
import type { QueueFilterState } from '@/kit/purchases/reconcile/types';
import type { ReactElement } from 'react';

export const meta: ScreenMeta = { title: 'Reconcile queue', order: 1, frame: 'web' };

interface QueueBodyProps {
  entries: QueueEntry[];
  isLoading: boolean;
  cursor: QueueCursor;
  onDecide: (entry: QueueEntry, kind: 'accept' | 'reject') => void;
  autoFocus: boolean;
}

function QueueBody({
  entries,
  isLoading,
  cursor,
  onDecide,
  autoFocus,
}: QueueBodyProps): ReactElement {
  if (isLoading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading the queue…
      </p>
    );
  }
  if (entries.length === 0) {
    return (
      <EmptyPanel
        title="Nothing is waiting on you"
        hint="Every charge in this filter is already decided or auto-linked. Widen the filter to see the rest."
      />
    );
  }
  return <QueueList entries={entries} cursor={cursor} onDecide={onDecide} autoFocus={autoFocus} />;
}

interface ReconcileQueuePageProps {
  allEntries?: QueueEntry[];
  isLoading?: boolean;
  error?: string | null;
  /** Caps how many charges the "server" hands back, to show the truncation notice. */
  limit?: number;
  initialChargeId?: string;
  /** The states view renders every case at once; only the default owns the page's focus. */
  autoFocus?: boolean;
}

/** `/purchases` — the reconciliation queue, ported for design review. */
export function ReconcileQueuePage({
  allEntries = purchasesQueue,
  isLoading = false,
  error = null,
  limit,
  initialChargeId,
  autoFocus = true,
}: ReconcileQueuePageProps): ReactElement {
  const [entries, setEntries] = useState(allEntries);
  const [filters, setFilters] = useState<QueueFilterState>({ ...DEFAULT_QUEUE_FILTERS });

  const matched = filterQueueEntries(entries, filters);
  const visible = limit === undefined ? matched : matched.slice(0, limit);
  const isTruncated = limit !== undefined && matched.length > limit;

  const cursor = useQueueCursor(visible, initialChargeId ?? null);
  const decisions = useQueueDecisions(entries, setEntries, cursor.skipPast);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Reconcile"
        description="Match purchase charges against the finance transactions that paid for them."
      />

      <QueueFilters value={filters} onChange={setFilters} />

      {error !== null && (
        <RetryableError
          title="Could not load the reconcile queue"
          message={error}
          retryLabel="Retry"
          onRetry={() => undefined}
        />
      )}

      {error === null && (
        <>
          <DecisionBar
            activeEntry={cursor.activeEntry}
            lastOutcome={decisions.lastOutcome}
            onDecide={decisions.decide}
          />
          <QueueBody
            entries={visible}
            isLoading={isLoading}
            cursor={cursor}
            onDecide={decisions.decide}
            autoFocus={autoFocus}
          />
          {isTruncated && (
            <p className="text-xs text-muted-foreground">
              Showing the first {limit} charges. More arrive as you work through these.
            </p>
          )}
        </>
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
  truncated: () => <ReconcileQueuePage limit={5} autoFocus={false} />,
  'row-selected': () => (
    <ReconcileQueuePage initialChargeId="chg_01K5Q3F7Y2W9J3HNRK6BMS" autoFocus={false} />
  ),
};

export default function ReconcileQueueScreen(): ReactElement {
  return <ReconcileQueuePage />;
}
