/**
 * The Activity feed's model: which kinds a filter chip covers, which events
 * a filter keeps, and the month groups the feed is read in.
 */
import { monthKey, monthLabel } from './when';

import type { EventActor, EventKind, EventModel } from '../shared/model';

/** The filter chips, each covering a family of event kinds. */
export type KindGroup = 'all' | 'placement' | 'containers' | 'edits' | 'lifecycle' | 'created';

/** Which chip each event kind belongs to. */
export const KIND_GROUP: Readonly<Record<EventKind, Exclude<KindGroup, 'all'>>> = {
  created: 'created',
  moved: 'placement',
  'picked-up': 'placement',
  'put-back': 'placement',
  opened: 'containers',
  closed: 'containers',
  'field-changed': 'edits',
  'type-set': 'edits',
  'code-set': 'edits',
  'quantity-changed': 'edits',
  split: 'edits',
  'photo-added': 'edits',
  connected: 'edits',
  retired: 'lifecycle',
  discarded: 'lifecycle',
  lost: 'lifecycle',
  destroyed: 'lifecycle',
  restored: 'lifecycle',
};

/** Chip labels, in the order the chips render. */
export const KIND_GROUP_LABELS: ReadonlyArray<{ id: KindGroup; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'placement', label: 'Moves' },
  { id: 'containers', label: 'Open and close' },
  { id: 'edits', label: 'Edits' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'created', label: 'Added' },
];

/** What the feed is narrowed to. */
export interface ActivityFilter {
  group: KindGroup;
  actor: EventActor | 'anyone';
  /** Matched against the item name and the event summary. */
  query: string;
}

/** The unfiltered feed. */
export const NO_FILTER: ActivityFilter = { group: 'all', actor: 'anyone', query: '' };

/** True when any part of the filter narrows the feed. */
export function isFiltered(filter: ActivityFilter): boolean {
  return filter.group !== 'all' || filter.actor !== 'anyone' || filter.query.trim() !== '';
}

function matchesQuery(event: EventModel, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return (
    event.itemName.toLowerCase().includes(needle) || event.summary.toLowerCase().includes(needle)
  );
}

/** The events a filter keeps, in their original order. */
export function filterEvents(events: readonly EventModel[], filter: ActivityFilter): EventModel[] {
  return events.filter(
    (event) =>
      (filter.group === 'all' || KIND_GROUP[event.kind] === filter.group) &&
      (filter.actor === 'anyone' || event.actor === filter.actor) &&
      matchesQuery(event, filter.query)
  );
}

/** One month of the feed. */
export interface MonthGroup {
  key: string;
  label: string;
  events: EventModel[];
}

/** Groups events by month, newest month first, newest event first within a month. */
export function groupByMonth(events: readonly EventModel[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const event of events) {
    const key = monthKey(event.at);
    const group = groups.get(key) ?? { key, label: monthLabel(event.at), events: [] };
    group.events.push(event);
    groups.set(key, group);
  }
  return [...groups.values()]
    .toSorted((a, b) => b.key.localeCompare(a.key))
    .map((group) => ({
      ...group,
      events: group.events.toSorted((a, b) => b.at.localeCompare(a.at)),
    }));
}

/** How many events each chip would show, for the chip counts. */
export function groupCounts(events: readonly EventModel[]): Record<KindGroup, number> {
  const counts: Record<KindGroup, number> = {
    all: events.length,
    placement: 0,
    containers: 0,
    edits: 0,
    lifecycle: 0,
    created: 0,
  };
  for (const event of events) counts[KIND_GROUP[event.kind]] += 1;
  return counts;
}
