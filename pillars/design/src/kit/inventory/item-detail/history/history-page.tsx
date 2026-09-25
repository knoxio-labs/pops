/**
 * `/inventory/items/:id/history`: every event of one item, grouped by
 * month, filtered by kind, each opening in full beside the list. The list
 * is the only thing that scrolls.
 */
import { useMemo, useState } from 'react';

import { Button, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation';
import { PAGE_HEIGHT } from '../section-parts';
import { ToastDock } from '../toast-dock';
import { useUndoToast } from '../use-undo-toast';
import { EventDetailSheet } from './event-detail';
import { HistoryHeader } from './history-header';
import { HistoryList } from './history-list';
import { FILTER_LABELS, filterCounts, filterEvents } from './history-model';

import type { EventModel } from '../../foundation';
import type { UndoOffer } from '../use-undo-toast';
import type { HistoryFilter } from './history-model';

/** Props for {@link ItemHistoryPage}. */
export interface ItemHistoryPageProps {
  itemName: string;
  events: readonly EventModel[];
  initialFilter?: HistoryFilter;
  initialOpenId?: string | null;
  initialToast?: UndoOffer;
}

const FILTERS: readonly HistoryFilter[] = ['all', 'placement', 'details', 'lifecycle'];

/** The item history page. */
export function ItemHistoryPage({
  itemName,
  events,
  initialFilter = 'all',
  initialOpenId = null,
  initialToast,
}: ItemHistoryPageProps) {
  const [filter, setFilter] = useState<HistoryFilter>(initialFilter);
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const toast = useUndoToast(initialToast ?? null, initialToast !== undefined);
  const counts = useMemo(() => filterCounts(events), [events]);
  const shown = useMemo(() => filterEvents(events, filter), [events, filter]);
  const undo = (id: string) => {
    const event = events.find((entry) => entry.id === id);
    setOpenId(null);
    if (event) toast.show('undo', `Undid: ${event.summary}`);
  };
  return (
    <div className={cn('@container flex max-w-4xl flex-col gap-4', PAGE_HEIGHT)}>
      <HistoryHeader itemName={itemName} total={events.length} />
      <div role="group" aria-label="Show" className="flex shrink-0 flex-wrap gap-2">
        {FILTERS.map((id) => (
          <Button
            key={id}
            size="sm"
            variant="outline"
            aria-pressed={filter === id}
            disabled={counts[id] === 0 && id !== 'all'}
            onClick={() => setFilter(id)}
            className={filter === id ? 'border-app-accent/60 bg-app-accent/15' : undefined}
          >
            {FILTER_LABELS[id]}
            <span className="text-xs tabular-nums text-muted-foreground">{counts[id]}</span>
          </Button>
        ))}
      </div>
      <HistoryList
        events={shown}
        filtered={filter !== 'all'}
        selectedId={openId}
        onOpen={setOpenId}
        onUndo={undo}
        onClearFilter={() => setFilter('all')}
        emptyIcon={INVENTORY_ICONS.history}
      />
      <EventDetailSheet
        event={events.find((entry) => entry.id === openId) ?? null}
        onClose={() => setOpenId(null)}
        onUndo={undo}
      />
      <ToastDock offer={toast.offer} onUndo={toast.undo} />
    </div>
  );
}
