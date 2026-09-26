import { INVENTORY_ICONS } from '../foundation';
/**
 * The last few things that happened to the item, newest first, with the
 * way into its full history. The full history is its own page because it
 * filters and groups by month; this is a glance.
 */
import { EventRow } from './history/event-row';
import { VerbButton } from './verb-button';

import type { EventModel } from '../foundation';

/** One line for a folded section header. */
export function historySummary(events: readonly EventModel[]): string {
  const latest = events[0];
  return latest === undefined ? 'Nothing recorded yet' : `Latest: ${latest.summary}`;
}

/** The history preview block. */
export function HistoryPreviewSection({
  events,
  total,
  limit = 8,
}: {
  events: readonly EventModel[];
  total: number;
  limit?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ul aria-label="Recent history" className="divide-y divide-border/60">
        {events.slice(0, limit).map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </ul>
      <VerbButton
        label={total > 1 ? `All ${total} events` : 'Open history'}
        icon={INVENTORY_ICONS.history}
        shortcutId="detail-history"
        variant="ghost"
        className="self-start"
      />
    </div>
  );
}
