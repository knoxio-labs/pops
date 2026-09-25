/**
 * The month-grouped event list, with sticky month headings, or what an
 * empty history or an empty filter means.
 */
import { Button, EmptyState } from '@pops/ui';

import { EventRow } from './event-row';
import { groupByMonth } from './history-model';

import type { LucideIcon } from 'lucide-react';

import type { EventModel } from '../../foundation';

/** Props for {@link HistoryList}. */
export interface HistoryListProps {
  events: readonly EventModel[];
  filtered: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
  onUndo: (id: string) => void;
  onClearFilter: () => void;
  emptyIcon: LucideIcon;
}

/** The list. */
export function HistoryList({
  events,
  filtered,
  selectedId,
  onOpen,
  onUndo,
  onClearFilter,
  emptyIcon,
}: HistoryListProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border bg-card">
        <EmptyState
          icon={emptyIcon}
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
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card">
      {groupByMonth(events).map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h2 className="sticky top-0 z-10 border-b bg-card/95 px-4 py-1.5 text-2xs font-semibold uppercase tracking-label text-muted-foreground backdrop-blur">
            {group.label}
          </h2>
          <ul className="divide-y divide-border/60 px-2">
            {group.events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                showActor
                selected={event.id === selectedId}
                onOpen={onOpen}
                onUndo={onUndo}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
