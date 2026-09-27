import type { EventKind, EventModel } from '../../foundation/model/model.js';

/** The event families available on the item history page. */
export type HistoryFilter = 'all' | 'placement' | 'details' | 'lifecycle';

/** The filter chips in their display order. */
export const HISTORY_FILTERS: readonly HistoryFilter[] = [
  'all',
  'placement',
  'details',
  'lifecycle',
];

/** The visible label for each item history filter. */
export const HISTORY_FILTER_LABELS: Readonly<Record<HistoryFilter, string>> = {
  all: 'All',
  placement: 'Where it went',
  details: 'Details',
  lifecycle: 'Lifecycle',
};

const EVENT_GROUP: Readonly<Record<EventKind, Exclude<HistoryFilter, 'all'>>> = {
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
  retired: 'lifecycle',
  discarded: 'lifecycle',
  lost: 'lifecycle',
  destroyed: 'lifecycle',
  restored: 'lifecycle',
  'photo-added': 'details',
  connected: 'details',
};

/** Returns the family shown by a non-`all` item history filter. */
export function filterOf(kind: EventKind): Exclude<HistoryFilter, 'all'> {
  return EVENT_GROUP[kind];
}

/** Filters item history events and orders the visible result newest first. */
export function filterEvents(events: readonly EventModel[], filter: HistoryFilter): EventModel[] {
  const kept =
    filter === 'all' ? [...events] : events.filter((event) => filterOf(event.kind) === filter);
  return kept.toSorted((left, right) => right.at.localeCompare(left.at));
}

/** Counts the events represented by each item history filter. */
export function filterCounts(events: readonly EventModel[]): Record<HistoryFilter, number> {
  const counts: Record<HistoryFilter, number> = {
    all: events.length,
    placement: 0,
    details: 0,
    lifecycle: 0,
  };
  for (const event of events) counts[filterOf(event.kind)] += 1;
  return counts;
}
