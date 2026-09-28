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
  total: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  disabledReason?: string;
  onOpen: (id: string) => void;
  onUndo: (id: string) => void;
  onClearFilter: () => void;
  onLoadMore: () => void;
}

type PagingProps = Pick<
  HistoryListProps,
  'total' | 'hasNextPage' | 'isFetchingNextPage' | 'onLoadMore'
> & { shownCount: number };
type LoadMoreProps = Pick<HistoryListProps, 'total' | 'isFetchingNextPage' | 'onLoadMore'> & {
  shownCount: number;
};

function LoadMoreButton({ shownCount, total, isFetchingNextPage, onLoadMore }: LoadMoreProps) {
  const remaining = Math.min(Math.max(total - shownCount, 0), 50);
  return (
    <Button size="sm" variant="outline" onClick={onLoadMore} disabled={isFetchingNextPage}>
      {isFetchingNextPage ? 'Loading events…' : `Load ${remaining} more`}
    </Button>
  );
}

function PagingFooter({
  shownCount,
  total,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: PagingProps) {
  if (!hasNextPage) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t p-3">
      <span className="text-xs text-muted-foreground">
        {shownCount} of {total} shown
      </span>
      <LoadMoreButton
        shownCount={shownCount}
        total={total}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}

function HistoryEmpty({
  filtered,
  total,
  hasNextPage,
  isFetchingNextPage,
  onClearFilter,
  onLoadMore,
}: Pick<
  HistoryListProps,
  'filtered' | 'total' | 'hasNextPage' | 'isFetchingNextPage' | 'onClearFilter' | 'onLoadMore'
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
      <PagingFooter
        shownCount={0}
        total={total}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onLoadMore}
      />
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
  total,
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
        total={total}
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
      <PagingFooter
        shownCount={events.length}
        total={total}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}
