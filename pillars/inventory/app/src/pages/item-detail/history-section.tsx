import { History } from 'lucide-react';

import { EmptyState } from '@pops/ui';

import type { DetailHistoryEvent } from '../../foundation/item-page';

function formatEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function HistoryRow({ event }: { event: DetailHistoryEvent }) {
  const transition = [event.before, event.after].filter((value): value is string => value !== null);
  return (
    <li className="flex gap-3 border-b border-border/60 px-2 py-3 last:border-b-0">
      <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{event.summary}</p>
        <p className="text-xs text-muted-foreground">
          {formatEventDate(event.at)} · {event.actorName}
        </p>
        {transition.length > 0 ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">{transition.join(' → ')}</p>
        ) : null}
        {event.reason ? <p className="mt-1 text-xs text-muted-foreground">{event.reason}</p> : null}
      </div>
      {event.undoable ? (
        <span className="shrink-0 text-2xs text-muted-foreground">Undoable</span>
      ) : null}
    </li>
  );
}

/** Renders the normalized append-only item history returned by the web read. */
export function HistorySection({ events }: { events: readonly DetailHistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nothing recorded yet"
        description="Changes to this item will appear here."
        size="sm"
      />
    );
  }
  return (
    <ul aria-label="History" className="divide-y divide-border/60">
      {events.map((event) => (
        <HistoryRow key={event.id} event={event} />
      ))}
    </ul>
  );
}

/** Renders the history section heading used by the tab pane. */
export function HistoryHeading() {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <History className="size-4" aria-hidden />
      History
    </h2>
  );
}
