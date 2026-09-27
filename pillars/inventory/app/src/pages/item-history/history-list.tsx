import { History } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { groupByMonth } from '../../foundation/model/event-groups.js';
import { HistoryEventRow } from './history-event-row.js';

import type { EventModel } from '../../foundation/model/model.js';

/** Props for {@link HistoryList}. */
export interface HistoryListProps {
  events: readonly EventModel[];
  filtered: boolean;
  selectedId: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  disabledReason?: string;
  onOpen: (id: string) => void;
  onUndo: (id: string) => void;
  onClearFilter: () => void;
  onLoadMore: () => void;
}

function LoadMoreButton({
  isFetchingNextPage,
  onLoadMore,
}: Pick<HistoryListProps, 'isFetchingNextPage' | 'onLoadMore'>) {
  return (
    <Button size="sm" variant="outline" onClick={onLoadMore} disabled={isFetchingNextPage}>
      {isFetchingNextPage ? 'Loading events…' : 'Load more events'}
    </Button>
  );
}

function HistoryEmpty({
  filtered,
  hasNextPage,
  isFetchingNextPage,
  onClearFilter,
  onLoadMore,
}: Pick<
  HistoryListProps,
  'filtered' | 'hasNextPage' | 'isFetchingNextPage' | 'onClearFilter' | 'onLoadMore'
>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center rounded-xl border bg-card">
      <EmptyState
        icon={History}
        size="sm"
        title={filtered ? 'No events of this kind' : 'Nothing has happened to it yet'}
        description={
          filtered
            ? 'Other kinds of event are hidden by the filter.'
            : 'Moves, edits and lifecycle changes appear here as they happen.'
        }
        action={
          filtered ? (
            <Button size="sm" variant="outline" onClick={onClearFilter}>
              Show all events
            </Button>
          ) : undefined
        }
      />
      {hasNextPage ? (
        <div className="flex justify-center border-t p-3">
          <LoadMoreButton isFetchingNextPage={isFetchingNextPage} onLoadMore={onLoadMore} />
        </div>
      ) : null}
    </div>
  );
}

function HistoryGroups({
  events,
  selectedId,
  onOpen,
  onUndo,
  disabledReason,
}: Pick<HistoryListProps, 'events' | 'selectedId' | 'onOpen' | 'onUndo' | 'disabledReason'>) {
  return (
    <>
      {groupByMonth(events).map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h2 className="sticky top-0 z-10 border-b bg-card/95 px-4 py-1.5 text-2xs font-semibold uppercase tracking-label text-muted-foreground backdrop-blur">
            {group.label}
          </h2>
          <ul className="divide-y divide-border/60 px-2">
            {group.events.map((event) => (
              <HistoryEventRow
                key={event.id}
                event={event}
                selected={event.id === selectedId}
                onOpen={onOpen}
                onUndo={onUndo}
                disabledReason={disabledReason}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** Renders the month-grouped event list, empty states, and cursor pagination. */
export function HistoryList({
  events,
  filtered,
  selectedId,
  hasNextPage,
  isFetchingNextPage,
  disabledReason,
  onOpen,
  onUndo,
  onClearFilter,
  onLoadMore,
}: HistoryListProps) {
  if (events.length === 0) {
    return (
      <HistoryEmpty
        filtered={filtered}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClearFilter={onClearFilter}
        onLoadMore={onLoadMore}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card">
      <HistoryGroups
        events={events}
        selectedId={selectedId}
        onOpen={onOpen}
        onUndo={onUndo}
        disabledReason={disabledReason}
      />
      {hasNextPage ? (
        <div className="flex justify-center border-t p-3">
          <LoadMoreButton isFetchingNextPage={isFetchingNextPage} onLoadMore={onLoadMore} />
        </div>
      ) : null}
    </div>
  );
}
