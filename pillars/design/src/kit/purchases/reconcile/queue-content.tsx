import { EmptyPanel } from '@/kit/purchases/empty-panel';

import { DecisionBar } from './decision-bar';
import { QueueList } from './queue-list';

import type { QueueEntry } from '@/fixtures/purchases-queue';
import type { ReactElement } from 'react';

import type { QueueCursor } from './cursor';
import type { DecisionOutcome, useQueueDecisions } from './decisions';

interface QueueBodyProps {
  entries: QueueEntry[];
  /** Whether the queue held any charge at all before this filter was applied. */
  hasUnfilteredEntries: boolean;
  isLoading: boolean;
  cursor: QueueCursor;
  onDecide: (entry: QueueEntry, kind: 'accept' | 'reject') => void;
  autoFocus: boolean;
}

/**
 * The list itself, and its two distinct empty states. A queue nobody has put
 * anything into and a filter that excluded everything are different
 * answers: the first is a fact about the queue, the second is a fact about
 * the filter.
 */
function QueueBody({
  entries,
  hasUnfilteredEntries,
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
    return hasUnfilteredEntries ? (
      <EmptyPanel
        title="Nothing matches this filter"
        hint="The queue holds charges, but none under this filter. Widen the filter to see the rest."
      />
    ) : (
      <EmptyPanel
        title="Nothing is waiting on you"
        hint="Every charge in this filter is already decided or auto-linked. Widen the filter to see the rest."
      />
    );
  }
  return <QueueList entries={entries} cursor={cursor} onDecide={onDecide} autoFocus={autoFocus} />;
}

interface QueueContentProps {
  visible: QueueEntry[];
  hasUnfilteredEntries: boolean;
  isLoading: boolean;
  isTruncated: boolean;
  limit: number;
  cursor: QueueCursor;
  decisions: ReturnType<typeof useQueueDecisions>;
  lastOutcome: DecisionOutcome | undefined;
  autoFocus: boolean;
  isPending: boolean;
}

/** The decision bar and the queue itself, once there's no load error to show instead. */
export function QueueContent({
  visible,
  hasUnfilteredEntries,
  isLoading,
  isTruncated,
  limit,
  cursor,
  decisions,
  lastOutcome,
  autoFocus,
  isPending,
}: QueueContentProps): ReactElement {
  return (
    <>
      <DecisionBar
        activeEntry={cursor.activeEntry}
        lastOutcome={lastOutcome ?? decisions.lastOutcome}
        onDecide={decisions.decide}
        isPending={isPending}
      />
      <QueueBody
        entries={visible}
        hasUnfilteredEntries={hasUnfilteredEntries}
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
  );
}
