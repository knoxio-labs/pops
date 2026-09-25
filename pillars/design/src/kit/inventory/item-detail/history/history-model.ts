/**
 * An item's history as its page filters it: events sorted into three kinds a
 * person filters by (where it went, what changed about it, whether it still
 * counts), newest first.
 */
import type { EventKind, EventModel } from '../../foundation';

/** The filter chips, in order. */
export type HistoryFilter = 'all' | 'placement' | 'details' | 'lifecycle';

const KIND_GROUP: Readonly<Record<EventKind, Exclude<HistoryFilter, 'all'>>> = {
  created: 'details',
  moved: 'placement',
  'picked-up': 'placement',
  'put-back': 'placement',
  opened: 'placement',
  closed: 'placement',
  'field-changed': 'details',
  'type-set': 'details',
  'code-set': 'details',
  'quantity-changed': 'details',
  split: 'details',
  'photo-added': 'details',
  connected: 'details',
  retired: 'lifecycle',
  discarded: 'lifecycle',
  lost: 'lifecycle',
  destroyed: 'lifecycle',
  restored: 'lifecycle',
};

/** Chip labels. */
export const FILTER_LABELS: Readonly<Record<HistoryFilter, string>> = {
  all: 'All',
  placement: 'Where it went',
  details: 'Details',
  lifecycle: 'Lifecycle',
};

/** The filter an event kind belongs to. */
export function filterOf(kind: EventKind): Exclude<HistoryFilter, 'all'> {
  return KIND_GROUP[kind];
}

/** Events that pass a filter, newest first whatever order they came in. */
export function filterEvents(events: readonly EventModel[], filter: HistoryFilter): EventModel[] {
  const kept = filter === 'all' ? [...events] : events.filter((e) => KIND_GROUP[e.kind] === filter);
  return kept.toSorted((a, b) => b.at.localeCompare(a.at));
}

/** How many events each chip would show. */
export function filterCounts(events: readonly EventModel[]): Record<HistoryFilter, number> {
  const counts: Record<HistoryFilter, number> = {
    all: events.length,
    placement: 0,
    details: 0,
    lifecycle: 0,
  };
  for (const entry of events) counts[KIND_GROUP[entry.kind]] += 1;
  return counts;
}
