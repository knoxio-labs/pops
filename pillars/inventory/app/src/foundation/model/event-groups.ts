/**
 * Shared history grouping and icon concepts for inventory activity surfaces.
 * Month boundaries use UTC so rendering does not depend on the viewer's zone.
 */
import type { InventoryConcept } from './icons';
import type { EventKind, EventModel } from './model';

/** The inventory concept used to render each history event kind. */
export const EVENT_CONCEPT: Readonly<Record<EventKind, InventoryConcept>> = {
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
  retired: 'retired',
  discarded: 'discarded',
  lost: 'lost',
  destroyed: 'destroyed',
  restored: 'undo',
  'photo-added': 'item',
  connected: 'connection',
};

/** One UTC calendar month of inventory events. */
export interface MonthGroup {
  key: string;
  label: string;
  events: EventModel[];
}

const MONTH = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Groups events by UTC month, newest month first and newest event first. */
export function groupByMonth(events: readonly EventModel[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const entry of events.toSorted(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()
  )) {
    const date = new Date(entry.at);
    const key = monthKey(date);
    const group = groups.get(key) ?? {
      key,
      label: MONTH.format(date),
      events: [],
    };
    group.events.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}
