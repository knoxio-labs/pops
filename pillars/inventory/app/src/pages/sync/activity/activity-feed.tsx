import { Button, Card, EmptyState, Skeleton } from '@pops/ui';

import { ListError } from '../../../foundation/list-page/list-states.js';
import { groupByMonth } from '../../../foundation/model/event-groups.js';
import { INVENTORY_ICONS } from '../../../foundation/model/icons.js';
import { EventRow } from './event-row.js';

import type { ReactElement } from 'react';

import type { EventModel } from '../../../foundation/model/model.js';

/** Props for the read-only Activity feed and its request states. */
export interface ActivityFeedProps {
  /** The current Activity request state. */
  status: 'pending' | 'error' | 'success';
  /** Events after converting the server response to display models. */
  events: readonly EventModel[];
  /** Timestamp used to keep relative event times stable for one render. */
  now: string;
  /** Event sequence currently open in the detail sheet. */
  openId: string | null;
  /** Opens an event detail sheet. */
  onOpen: (id: string) => void;
  /** Whether the current filters narrow the feed. */
  filtered: boolean;
  /** Clears the current Activity filters. */
  onClear: () => void;
  /** Whether another server page is available. */
  hasNextPage: boolean;
  /** Whether the next server page is loading. */
  isFetchingNextPage: boolean;
  /** Requests the next server page. */
  onLoad: () => void;
  /** Retries the current server request. */
  onRetry: () => void;
}

function LoadingActivity(): ReactElement {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading activity">
      {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((key) => (
        <Skeleton key={key} className="h-8 w-full" />
      ))}
    </div>
  );
}

function EmptyActivity({
  filtered,
  onClear,
}: Pick<ActivityFeedProps, 'filtered' | 'onClear'>): ReactElement {
  if (filtered) {
    return (
      <EmptyState
        icon={INVENTORY_ICONS.history}
        title="No change matches these filters"
        description="The feed has changes, just none of this kind, by this source, in this date range, or with these words."
        action={
          <Button type="button" size="sm" variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        }
        size="md"
      />
    );
  }
  return (
    <EmptyState
      icon={INVENTORY_ICONS.history}
      title="No changes yet"
      description="Every add, move, edit and lifecycle change is recorded here, from the web, phones and imports."
      size="md"
    />
  );
}

function ActivityRows({
  events,
  now,
  openId,
  onOpen,
}: Pick<ActivityFeedProps, 'events' | 'now' | 'openId' | 'onOpen'>): ReactElement {
  return (
    <div className="h-full overflow-y-auto">
      {groupByMonth(events).map((month) => (
        <section key={month.key} aria-label={month.label}>
          <h3 className="sticky top-0 z-1 border-b bg-card/95 px-4 py-1.5 text-2xs font-semibold uppercase tracking-label text-muted-foreground backdrop-blur">
            {month.label} · {month.events.length}
          </h3>
          <ul className="divide-y divide-border/60">
            {month.events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                now={now}
                active={event.id === openId}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  onLoad,
}: Pick<ActivityFeedProps, 'hasNextPage' | 'isFetchingNextPage' | 'onLoad'>): ReactElement | null {
  if (!hasNextPage) return null;
  return (
    <div className="flex justify-center border-t p-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        loading={isFetchingNextPage}
        onClick={onLoad}
      >
        Load more activity
      </Button>
    </div>
  );
}

/** Renders Activity loading, error, empty, list, and pagination states. */
export function ActivityFeed({
  status,
  events,
  now,
  openId,
  onOpen,
  filtered,
  onClear,
  hasNextPage,
  isFetchingNextPage,
  onLoad,
  onRetry,
}: ActivityFeedProps): ReactElement {
  let content: ReactElement;
  if (status === 'pending') {
    content = <LoadingActivity />;
  } else if (status === 'error') {
    content = <ListError noun="activity" onRetry={onRetry} />;
  } else if (events.length === 0) {
    content = <EmptyActivity filtered={filtered} onClear={onClear} />;
  } else {
    content = (
      <>
        <ActivityRows events={events} now={now} openId={openId} onOpen={onOpen} />
        <LoadMore
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoad={onLoad}
        />
      </>
    );
  }
  return <Card className="min-h-0 min-w-0 flex-1 overflow-hidden py-0">{content}</Card>;
}
