import { History } from 'lucide-react';
import { useNavigate } from 'react-router';

import { EventMark } from '../../foundation/badges/event-mark.js';
import { EmptyLine, PaneLabel, shortDate } from '../../foundation/item-page/section-parts';
import { VerbButton } from '../../foundation/item-page/verb-button';
import { historySummary } from './detail-sections';

import type { ReactElement } from 'react';

import type { EventModel } from '../../foundation/model/model.js';

const EMPTY_EVENTS: readonly EventModel[] = [];

function PreviewRows({ events }: { events: readonly EventModel[] }): ReactElement {
  return (
    <ul aria-label="Recent history" className="flex flex-col divide-y rounded-lg border">
      {events.slice(0, 8).map((event) => (
        <li key={event.id} className="flex min-h-11 items-center gap-3 px-2 py-1">
          <EventMark event={event} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm text-foreground">{event.summary}</span>
            <span className="truncate text-xs text-muted-foreground">{event.actorName}</span>
          </span>
          <time dateTime={event.at} className="shrink-0 text-xs text-muted-foreground">
            {shortDate(event.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}

/** Renders the compact history preview and its route to the full event list. */
export function HistoryPreviewSection({
  itemId,
  eventCount,
  events = EMPTY_EVENTS,
}: {
  itemId: string;
  eventCount: number | null;
  events?: readonly EventModel[];
}): ReactElement {
  const navigate = useNavigate();
  const label = eventCount !== null && eventCount > 0 ? `All ${eventCount} events` : 'Open history';
  let preview: ReactElement;
  if (eventCount === null) {
    preview = <EmptyLine icon={History} text="History is loading." />;
  } else if (eventCount === 0) {
    preview = <EmptyLine icon={History} text="Nothing recorded yet." />;
  } else {
    preview = <PreviewRows events={events} />;
  }
  return (
    <section aria-label="History" className="flex flex-col gap-3">
      <PaneLabel
        trailing={
          <VerbButton
            label={label}
            icon={History}
            shortcutId="detail-history"
            onClick={() => navigate(`/inventory/items/${itemId}/history`)}
          />
        }
      >
        History
      </PaneLabel>
      {eventCount !== null && eventCount > 0 ? (
        <p className="text-sm text-muted-foreground">{historySummary(events, eventCount)}</p>
      ) : null}
      {preview}
    </section>
  );
}
