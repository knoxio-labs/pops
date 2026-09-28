import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { cn } from '@pops/ui';

import { PAGE_HEIGHT } from '../../foundation/frame/page-frame.js';
import { toEventModel } from '../../inventory-web/event-model.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useRevertEvent } from '../../inventory-web/useRevertEvent.js';
import { useWebEvents } from '../../inventory-web/useWebEvents.js';
import {
  chipCounts,
  historyKinds,
  parseHistoryFilter,
  type HistoryFilter,
} from './history-model.js';
import { HistoryPageContent } from './history-page-content.js';
import { HistoryPageHeader } from './history-page-header.js';

import type { PickerSubject } from '../../foundation/model/contracts.js';
import type { WebEventsFeed } from '../../inventory-web/useWebEvents.js';

function itemPath(id: string | undefined): string {
  return id === undefined ? '/inventory/items' : `/inventory/items/${id}`;
}

function HistoryPageSurface({
  itemName,
  itemHref,
  events,
  sourceById,
  filter,
  counts,
  onFilterChange,
  history,
  isOnline,
  revertEvent,
  navigate,
}: {
  itemName: string;
  itemHref: string;
  events: ReturnType<typeof toEventModel>[];
  sourceById: ReadonlyMap<string, WebEventsFeed['events'][number]>;
  filter: HistoryFilter;
  counts: ReturnType<typeof chipCounts>;
  onFilterChange: (filter: HistoryFilter) => void;
  history: WebEventsFeed;
  isOnline: boolean;
  revertEvent: ReturnType<typeof useRevertEvent>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className={cn('@container flex max-w-5xl flex-col gap-4', PAGE_HEIGHT)}>
      <HistoryPageHeader
        itemName={itemName}
        itemHref={itemHref}
        eventCount={events.length}
        hasNextPage={history.hasNextPage}
      />
      <HistoryPageContent
        events={events}
        sourceById={sourceById}
        filter={filter}
        counts={counts}
        onFilterChange={onFilterChange}
        history={{
          isPending: history.status === 'pending',
          isError: history.status === 'error',
          total: history.total,
          hasNextPage: history.hasNextPage,
          isFetchingNextPage: history.isFetchingNextPage,
          fetchNextPage: history.fetchNextPage,
          refetch: history.refetch,
        }}
        hasCachedData={history.total !== null}
        isOnline={isOnline}
        revertEvent={revertEvent}
        navigate={navigate}
      />
    </div>
  );
}

/** Renders the cursor-paged, filterable history for one inventory item. */
export function ItemHistoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseHistoryFilter(searchParams.get('kind'));
  const subject = useMemo<PickerSubject>(
    () => ({ kind: 'items', ids: id === undefined ? [] : [id] }),
    [id]
  );
  const placement = usePlacementSources(subject);
  const isOnline = useOnline();
  const history = useWebEvents({ entityId: id, kinds: historyKinds(filter), limit: 50 });
  const revertEvent = useRevertEvent();
  const sources = history.events;
  const itemName = sources[0]?.entityName ?? placement.world.items.get(id ?? '')?.name ?? 'Item';
  const typeNames = useMemo(
    () => new Map((placement.catalogue?.types ?? []).map((type) => [type.id, type.label] as const)),
    [placement.catalogue]
  );
  const events = useMemo(
    () => sources.map((event) => toEventModel(event, placement.world, typeNames)),
    [placement.world, sources, typeNames]
  );
  const sourceById = useMemo(
    () => new Map(sources.map((event) => [String(event.seq), event] as const)),
    [sources]
  );
  const total = history.total ?? events.length;
  const counts = useMemo(() => chipCounts(history.kindCounts, total), [history.kindCounts, total]);
  const onFilterChange = useCallback(
    (nextFilter: HistoryFilter) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (nextFilter === 'all') next.delete('kind');
          else next.set('kind', nextFilter);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return (
    <HistoryPageSurface
      itemName={itemName}
      itemHref={itemPath(id)}
      events={events}
      sourceById={sourceById}
      filter={filter}
      counts={counts}
      onFilterChange={onFilterChange}
      history={history}
      isOnline={isOnline}
      revertEvent={revertEvent}
      navigate={navigate}
    />
  );
}
