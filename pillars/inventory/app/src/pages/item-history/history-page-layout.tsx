import { cn } from '@pops/ui';

import { HistoryEventDetail } from './history-event-detail.js';
import { HistoryList } from './history-list.js';

import type { EventModel } from '../../foundation/model/model.js';

/** Props for {@link HistoryPageLayout}. */
export interface HistoryPageLayoutProps {
  shownEvents: readonly EventModel[];
  filtered: boolean;
  openEvent: EventModel | null;
  openId: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onOpen: (id: string) => void;
  onUndo: (id: string) => void;
  onClose: () => void;
  onClearFilter: () => void;
  onLoadMore: () => void;
}

/** Lays out the history list beside the selected event detail panel. */
export function HistoryPageLayout({
  shownEvents,
  filtered,
  openEvent,
  openId,
  hasNextPage,
  isFetchingNextPage,
  onOpen,
  onUndo,
  onClose,
  onClearFilter,
  onLoadMore,
}: HistoryPageLayoutProps) {
  return (
    <div
      className={cn('min-h-0 flex-1', openEvent === null ? 'flex' : 'grid gap-4 lg:grid-cols-3')}
    >
      <div className={cn('min-h-0', openEvent === null ? 'flex min-w-0 flex-1' : 'lg:col-span-2')}>
        <HistoryList
          events={shownEvents}
          filtered={filtered}
          selectedId={openId}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onOpen={onOpen}
          onUndo={onUndo}
          onClearFilter={onClearFilter}
          onLoadMore={onLoadMore}
        />
      </div>
      {openEvent !== null ? (
        <HistoryEventDetail
          event={openEvent}
          onClose={onClose}
          onUndo={onUndo}
          className="min-w-0"
        />
      ) : null}
    </div>
  );
}
