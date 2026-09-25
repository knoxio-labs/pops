/**
 * An item's history as its page reads it: events sorted into three kinds a
 * person filters by (where it went, what changed about it, whether it still
 * counts), grouped by calendar month, newest first. Months are UTC so a
 * month boundary never depends on the viewer's timezone.
 */
import type { EventKind, EventModel, InventoryConcept } from '../../foundation';

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

const KIND_CONCEPT: Readonly<Record<EventKind, InventoryConcept>> = {
  created: 'item',
  moved: 'move',
  'picked-up': 'pickUp',
  'put-back': 'putBack',
  opened: 'open',
  closed: 'closed',
  'field-changed': 'type',
  'type-set': 'type',
  'code-set': 'code',
  'quantity-changed': 'quantity',
  split: 'quantity',
  'photo-added': 'item',
  connected: 'connection',
  retired: 'retired',
  discarded: 'discarded',
  lost: 'lost',
  destroyed: 'destroyed',
  restored: 'undo',
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

/** The icon concept for an event kind. */
export function eventConcept(kind: EventKind): InventoryConcept {
  return KIND_CONCEPT[kind];
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

/** One month of events. */
export interface MonthGroup {
  key: string;
  label: string;
  events: EventModel[];
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Events grouped by calendar month (UTC), newest month and newest event first. */
export function groupByMonth(events: readonly EventModel[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const entry of events.toSorted((a, b) => b.at.localeCompare(a.at))) {
    const key = entry.at.slice(0, 7);
    const group = groups.get(key) ?? { key, label: MONTH.format(new Date(entry.at)), events: [] };
    group.events.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}
