import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';

import { cn } from '@pops/ui';

import { PAGE_HEIGHT } from '../../foundation/frame/page-frame.js';
import { toEventModel } from '../../inventory-web/event-model.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useRevertEvent } from '../../inventory-web/useRevertEvent.js';
import { useWebItemHistory } from '../../inventory-web/useWebItemDetail.js';
import { HistoryPageContent } from './history-page-content.js';
import { HistoryPageHeader } from './history-page-header.js';

import type { PickerSubject } from '../../foundation/model/contracts.js';
import type { WebGetResponses } from '../../inventory-api/types.gen.js';
import type { WebEvent } from '../../inventory-web/useWebEvents.js';

type HistoryPage = WebGetResponses[200];
type HistoryWireEvent = HistoryPage['history']['events'][number];

const EMPTY_HISTORY_PAGES: readonly HistoryPage[] = [];

function itemPath(id: string | undefined): string {
  return id === undefined ? '/inventory/items' : `/inventory/items/${id}`;
}

function asWebEvent(event: HistoryWireEvent, entityName: string): WebEvent {
  return { ...event, entityName };
}

function historySources(pages: readonly HistoryPage[], entityName: string): WebEvent[] {
  return pages.flatMap((page) => page.history.events.map((event) => asWebEvent(event, entityName)));
}

/** Renders the cursor-paged, filterable history for one inventory item. */
export function ItemHistoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const subject = useMemo<PickerSubject>(
    () => ({ kind: 'items', ids: id === undefined ? [] : [id] }),
    [id]
  );
  const placement = usePlacementSources(subject);
  const history = useWebItemHistory(id);
  const revertEvent = useRevertEvent();
  const pages = history.data?.pages ?? EMPTY_HISTORY_PAGES;
  const itemName = pages[0]?.item.name ?? 'Item';
  const sources = useMemo(() => historySources(pages, itemName), [itemName, pages]);
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
  const itemHref = itemPath(id);

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
        history={history}
        revertEvent={revertEvent}
        navigate={navigate}
      />
    </div>
  );
}
