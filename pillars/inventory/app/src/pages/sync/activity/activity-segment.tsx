import { useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { toEventModel } from '../../../inventory-web/event-model.js';
import { usePlacementSources } from '../../../inventory-web/usePlacementSources.js';
import { useWebEvents } from '../../../inventory-web/useWebEvents.js';
import { ActivityFeed } from './activity-feed.js';
import { ActivityFilters } from './activity-filters.js';
import {
  NO_FILTER,
  SERVER_KIND_GROUPS,
  filterEvents,
  isFiltered,
  parseActivityFilter,
  writeActivityFilter,
} from './activity-model.js';
import { EventDetailSheet } from './event-detail-sheet.js';

import type { ReactElement } from 'react';

import type { PickerSubject } from '../../../foundation/model/contracts.js';
import type { EventModel } from '../../../foundation/model/model.js';
import type { WebEvent } from '../../../inventory-web/useWebEvents.js';
import type { ActivityFilter, KindGroup } from './activity-model.js';

const ACTIVITY_SUBJECT: PickerSubject = { kind: 'items', ids: [] };

/** Props for the live read-only Activity segment. */
export interface ActivitySegmentProps {
  /** Kept in the Sync page contract; Activity has no write controls to disable. */
  disabledReason?: string;
}

interface ActivityUrlState {
  filter: ActivityFilter;
  itemId: string | undefined;
  openId: string | null;
  setFilter: (filter: ActivityFilter) => void;
  openEvent: (id: string) => void;
  closeEvent: () => void;
}

interface ActivityData {
  feed: ReturnType<typeof useWebEvents>;
  events: EventModel[];
  eventById: ReadonlyMap<string, WebEvent>;
}

function useActivityUrlState(): ActivityUrlState {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseActivityFilter(searchParams);
  const setFilter = (nextFilter: ActivityFilter): void => {
    setSearchParams((current) => writeActivityFilter(current, nextFilter), { replace: true });
  };
  const openEvent = (id: string): void => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('event', id);
        return next;
      },
      { replace: true }
    );
  };
  const closeEvent = (): void => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('event');
        return next;
      },
      { replace: true }
    );
  };
  return {
    filter,
    itemId: searchParams.get('item') ?? undefined,
    openId: searchParams.get('event'),
    setFilter,
    openEvent,
    closeEvent,
  };
}

function serverKinds(group: KindGroup): readonly string[] | undefined {
  return group === 'all' ? undefined : SERVER_KIND_GROUPS[group];
}

function useActivityData(filter: ActivityFilter, itemId: string | undefined): ActivityData {
  const placement = usePlacementSources(ACTIVITY_SUBJECT);
  const typeNames = useMemo(
    () => new Map((placement.catalogue?.types ?? []).map((type) => [type.id, type.label] as const)),
    [placement.catalogue]
  );
  const feed = useWebEvents({
    kinds: serverKinds(filter.group),
    actorKind: filter.actor === 'anyone' ? undefined : filter.actor,
    entityId: itemId,
    q: filter.query,
  });
  const events = useMemo(
    () => feed.events.map((event) => toEventModel(event, placement.world, typeNames)),
    [feed.events, placement.world, typeNames]
  );
  const eventById = useMemo(
    () => new Map(feed.events.map((event) => [String(event.seq), event] as const)),
    [feed.events]
  );
  return { feed, events, eventById };
}

function ActivityBody({
  data,
  url,
  now,
}: {
  data: ActivityData;
  url: ActivityUrlState;
  now: string;
}): ReactElement {
  const shown = filterEvents(data.events, url.filter);
  const openModel = data.events.find((event) => event.id === url.openId);
  const openSource = url.openId === null ? undefined : data.eventById.get(url.openId);
  const hasDetail = openModel !== undefined;
  return (
    <div
      className={
        hasDetail
          ? 'relative flex min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(0,1fr)_30rem] xl:gap-3'
          : 'flex min-h-0 flex-1'
      }
    >
      <ActivityFeed
        status={data.feed.status}
        events={shown}
        now={now}
        openId={url.openId}
        onOpen={url.openEvent}
        filtered={isFiltered(url.filter)}
        onClear={() => url.setFilter(NO_FILTER)}
        hasNextPage={data.feed.hasNextPage}
        isFetchingNextPage={data.feed.isFetchingNextPage}
        onLoad={data.feed.fetchNextPage}
        onRetry={data.feed.refetch}
      />
      {hasDetail ? (
        <div className="absolute inset-y-0 right-0 z-10 flex max-w-full shadow-xl xl:static xl:shadow-none [&>section]:w-120 xl:[&>section]:w-full">
          <EventDetailSheet event={openModel} source={openSource} onClose={url.closeEvent} />
        </div>
      ) : null}
    </div>
  );
}

/** Renders the filtered event feed, its states, and the selected event sheet. */
export function ActivitySegment({
  disabledReason: _disabledReason,
}: ActivitySegmentProps): ReactElement {
  const url = useActivityUrlState();
  const data = useActivityData(url.filter, url.itemId);
  const now = new Date().toISOString();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ActivityFilters events={data.events} filter={url.filter} onChange={url.setFilter} />
      <ActivityBody data={data} url={url} now={now} />
    </div>
  );
}
