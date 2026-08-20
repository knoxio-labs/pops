import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { DecisionBar } from './reconcile/DecisionBar.js';
import { QueueFilters } from './reconcile/QueueFilters.js';
import { QueueList } from './reconcile/QueueList.js';
import { DEFAULT_QUEUE_FILTERS, type QueueFilterState } from './reconcile/types.js';
import { useQueueCursor } from './reconcile/useQueueCursor.js';
import { useReconcileDecisions } from './reconcile/useReconcileDecisions.js';
import { QUEUE_PAGE_SIZE, useReconcileQueue } from './reconcile/useReconcileQueue.js';
import { RetryableError } from './RetryableError.js';

import type { ReactElement } from 'react';

import type { QueueEntry } from './reconcile/types.js';

/**
 * `/purchases` — the reconciliation queue.
 *
 * An inbox, not a wizard: one row per charge awaiting a decision, driven from
 * the keyboard, because the first backfill produces hundreds of rows and a
 * mouse round-trip per row is how a queue gets abandoned.
 *
 * What the two decisions persist is narrower than the surface suggests, and
 * the view says so rather than implying otherwise — see
 * `reconcile/useReconcileDecisions.ts` and this package's README.
 */
export function ReconcileQueuePage(): ReactElement {
  const { t } = useTranslation('purchases');
  const [filters, setFilters] = useState<QueueFilterState>(() => ({ ...DEFAULT_QUEUE_FILTERS }));
  const { entries, isLoading, error, isTruncated, refetch } = useReconcileQueue(filters);
  const cursor = useQueueCursor(entries);
  const decisions = useReconcileDecisions(cursor.skipPast);

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={t('reconcile.title')} description={t('reconcile.intro')} />

      <QueueFilters value={filters} onChange={setFilters} />

      {error !== null && (
        <RetryableError
          title={t('reconcile.error.title')}
          message={error.message}
          retryLabel={t('reconcile.error.retry')}
          onRetry={refetch}
        />
      )}

      {error === null && (
        <>
          <DecisionBar
            activeEntry={cursor.activeEntry}
            isPending={decisions.isPending}
            lastOutcome={decisions.lastOutcome}
            onDecide={decisions.decide}
          />
          <QueueBody
            entries={entries}
            isLoading={isLoading}
            cursor={cursor}
            isDeciding={decisions.isPending}
            onDecide={decisions.decide}
          />
          {isTruncated && (
            <p className="text-muted-foreground text-xs">
              {t('reconcile.truncated', { limit: QUEUE_PAGE_SIZE })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

interface QueueBodyProps {
  entries: QueueEntry[];
  isLoading: boolean;
  cursor: ReturnType<typeof useQueueCursor>;
  isDeciding: boolean;
  onDecide: ReturnType<typeof useReconcileDecisions>['decide'];
}

function QueueBody({
  entries,
  isLoading,
  cursor,
  isDeciding,
  onDecide,
}: QueueBodyProps): ReactElement {
  const { t } = useTranslation('purchases');

  if (isLoading) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {t('reconcile.loading')}
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center">
        <p className="mb-2 text-base font-medium">{t('reconcile.empty.title')}</p>
        <p className="text-muted-foreground text-sm">{t('reconcile.empty.hint')}</p>
      </div>
    );
  }

  return (
    <QueueList entries={entries} cursor={cursor} isDeciding={isDeciding} onDecide={onDecide} />
  );
}
