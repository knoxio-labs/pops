/**
 * The Activity segment: filters, then the feed grouped by month, newest
 * first, with the event detail beside it when one is open. Only the feed
 * scrolls; month headings stay pinned while their month is in view.
 */
import { useState } from 'react';

import { Button, Card, EmptyState, Skeleton } from '@pops/ui';

import { groupByMonth } from '../shared/event-groups';
import { INVENTORY_ICONS } from '../shared/icons';
import { ActivityFilters } from './activity-filters';
import { NO_FILTER, filterEvents, isFiltered } from './activity-model';
import { EventDetailSheet } from './event-detail-sheet';
import { EventRow } from './event-row';

import type { ReactNode } from 'react';

import type { EventModel } from '../shared/model';
import type { ActivityFilter } from './activity-model';

/** Props for {@link ActivityFeed}. */
export interface ActivityFeedProps {
  events: readonly EventModel[];
  now: string;
  initialFilter?: ActivityFilter;
  openEventId?: string;
  loading?: boolean;
  disabledReason?: string;
}

function Feed({
  events,
  now,
  openEventId,
  disabledReason,
}: {
  events: EventModel[];
  now: string;
  openEventId?: string;
  disabledReason?: string;
}) {
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
                active={event.id === openEventId}
                disabledReason={disabledReason}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Empty({ filtered, onClear }: { filtered: boolean; onClear: () => void }): ReactNode {
  if (filtered) {
    return (
      <EmptyState
        icon={INVENTORY_ICONS.history}
        title="No change matches these filters"
        description="The feed has changes, just none of this kind, by this source, or with these words."
        action={
          <Button size="sm" variant="outline" onClick={onClear}>
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

function Loading() {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading activity">
      {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((key) => (
        <Skeleton key={key} className="h-8 w-full" />
      ))}
    </div>
  );
}

/** The segment body. */
export function ActivityFeed({
  events,
  now,
  initialFilter = NO_FILTER,
  openEventId,
  loading,
  disabledReason,
}: ActivityFeedProps) {
  const [filter, setFilter] = useState(initialFilter);
  const shown = filterEvents(events, filter);
  const open = events.find((event) => event.id === openEventId);
  const filtered = isFiltered(filter);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ActivityFilters events={events} filter={filter} onChange={setFilter} />
      <div
        className={
          open
            ? 'relative flex min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(0,1fr)_30rem] xl:gap-3'
            : 'flex min-h-0 flex-1'
        }
      >
        <Card className="min-h-0 min-w-0 flex-1 overflow-hidden py-0">
          {loading ? <Loading /> : null}
          {!loading && shown.length === 0 ? (
            <Empty filtered={filtered} onClear={() => setFilter(NO_FILTER)} />
          ) : null}
          {!loading && shown.length > 0 ? (
            <Feed
              events={shown}
              now={now}
              openEventId={openEventId}
              disabledReason={disabledReason}
            />
          ) : null}
        </Card>
        {open ? (
          <div className="absolute inset-y-0 right-0 z-10 flex max-w-full shadow-xl xl:static xl:shadow-none [&>section]:w-120 xl:[&>section]:w-full">
            <EventDetailSheet event={open} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
