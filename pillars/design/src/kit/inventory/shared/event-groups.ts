/**
 * How every history surface draws and groups events, so a move looks the
 * same in Recent work, the Activity feed and an item's history, and both
 * lists break into the same months. Months are UTC so a boundary never
 * depends on the viewer's timezone.
 */
import type { InventoryConcept } from './icons';
import type { EventKind, EventModel } from './model';

/** The concept symbol each event kind is drawn with. */
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

/** One calendar month of events: key "2026-09", label "September 2026". */
export interface MonthGroup {
  key: string;
  label: string;
  events: EventModel[];
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Events grouped by UTC calendar month, newest month first, newest event first within it. */
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
