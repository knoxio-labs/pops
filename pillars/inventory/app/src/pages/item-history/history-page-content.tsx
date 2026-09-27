import { useCallback, useMemo, useState } from 'react';

import { Skeleton } from '@pops/ui';

import { LoadError } from '../../foundation/frame/load-error.js';
import { undoEvent } from '../overview/overview-event-actions.js';
import { HistoryFilters } from './history-filters.js';
import { filterCounts, filterEvents } from './history-model.js';
import { HistoryPageLayout } from './history-page-layout.js';

import type { EventModel } from '../../foundation/model/model.js';
import type { WebEvent } from '../../inventory-web/useWebEvents.js';
import type { HistoryFilter } from './history-model.js';

/** The query controls needed by the history page without exposing React Query internals. */
export interface HistoryQueryState {
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
}

/** Props for {@link HistoryPageContent}. */
export interface HistoryPageContentProps {
  events: readonly EventModel[];
  sourceById: ReadonlyMap<string, WebEvent>;
  history: HistoryQueryState;
  revertEvent: (event: Pick<WebEvent, 'seq' | 'entityId'>) => Promise<void>;
  navigate: (path: string) => void | Promise<void>;
}

function HistoryLoading() {
  return (
    <div
      role="status"
      aria-label="Loading history"
      className="min-h-0 flex-1 space-y-2 rounded-xl border bg-card p-3"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex min-h-11 items-center gap-3 px-2 py-1">
          <Skeleton className="size-7 shrink-0" />
          <Skeleton className="h-4 min-w-0 flex-1" />
          <Skeleton className="hidden h-3 w-24 @xl:block" />
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

function HistoryReady({
  events,
  sourceById,
  history,
  revertEvent,
  navigate,
}: HistoryPageContentProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const counts = useMemo(() => filterCounts(events), [events]);
  const shownEvents = useMemo(() => filterEvents(events, filter), [events, filter]);
  const openEvent = events.find((event) => event.id === openId) ?? null;
  const onUndo = useCallback(
    async (eventId: string) => {
      const event = events.find((entry) => entry.id === eventId);
      const source = sourceById.get(eventId);
      if (event === undefined || source === undefined) return;
      setOpenId(null);
      await undoEvent({ model: event, source }, revertEvent, navigate);
    },
    [events, navigate, revertEvent, sourceById]
  );

  return (
    <>
      <HistoryFilters filter={filter} counts={counts} onChange={setFilter} />
      <HistoryPageLayout
        shownEvents={shownEvents}
        filtered={filter !== 'all'}
        openEvent={openEvent}
        openId={openId}
        hasNextPage={history.hasNextPage}
        isFetchingNextPage={history.isFetchingNextPage}
        onOpen={setOpenId}
        onUndo={(eventId) => void onUndo(eventId)}
        onClose={() => setOpenId(null)}
        onClearFilter={() => setFilter('all')}
        onLoadMore={() => void history.fetchNextPage()}
      />
    </>
  );
}

/** Renders loading, retry, filter, list, detail, pagination, and undo states. */
export function HistoryPageContent(props: HistoryPageContentProps) {
  if (props.history.isPending) return <HistoryLoading />;
  if (props.history.isError) {
    return (
      <LoadError
        title="This history could not be loaded"
        detail="The inventory service did not return this item's history."
        onRetry={() => void props.history.refetch()}
      />
    );
  }
  return <HistoryReady {...props} />;
}
