/**
 * The Activity feed and Recent work: the foundation's seeded history plus
 * this morning's work, so the feed opens on today and scrolls back through
 * two months. Times are read against `DESIGN_NOW`.
 */
import { coreEvents } from './events';

import type { EventModel } from '@/kit/inventory/shared/model';

type Today = Omit<EventModel, 'actorName' | 'before' | 'after' | 'reason'> &
  Partial<Pick<EventModel, 'before' | 'after' | 'reason'>>;

const ACTOR_NAMES: Record<EventModel['actor'], string> = {
  web: 'Joao on the web',
  device: "Joao's iPhone",
  service: 'Purchases import',
  migration: 'Catalogue revision 12',
};

function today(seed: Today): EventModel {
  return {
    before: null,
    after: null,
    reason: null,
    ...seed,
    actorName: ACTOR_NAMES[seed.actor],
  };
}

/** The event whose Undo conflicts: Monitor 27 in was moved again after this. */
export const monitorMoveEvent = today({
  id: 'act-03',
  kind: 'moved',
  itemId: 'itm-monitor',
  itemName: 'Monitor 27 in',
  at: '2026-09-25T09:58:00Z',
  actor: 'web',
  summary: 'Moved into Office 04',
  before: 'Desk',
  after: 'Office 04',
  undoable: true,
});

/** The event the detail sheet opens on: a field change with both values. */
export const screenSizeEvent = today({
  id: 'act-06',
  kind: 'field-changed',
  itemId: 'itm-tv',
  itemName: 'Television',
  at: '2026-09-25T09:05:00Z',
  actor: 'web',
  summary: 'Screen size changed',
  before: '55 in',
  after: '65 in',
  undoable: true,
});

const morning: readonly EventModel[] = [
  today({
    id: 'act-01',
    kind: 'picked-up',
    itemId: 'itm-torch',
    itemName: 'Torch',
    at: '2026-09-25T10:32:00Z',
    actor: 'device',
    summary: 'Picked up. It had no place yet',
    undoable: true,
  }),
  today({
    id: 'act-02',
    kind: 'picked-up',
    itemId: 'itm-headphones',
    itemName: 'Headphones',
    at: '2026-09-25T10:12:00Z',
    actor: 'device',
    summary: 'Picked up from Spare room',
    undoable: false,
  }),
  monitorMoveEvent,
  today({
    id: 'act-04',
    kind: 'moved',
    itemId: 'itm-keyboard',
    itemName: 'Keyboard',
    at: '2026-09-25T09:57:00Z',
    actor: 'web',
    summary: 'Moved into Office 04',
    before: 'Desk',
    after: 'Office 04',
    undoable: true,
  }),
  today({
    id: 'act-05',
    kind: 'opened',
    itemId: 'box-cables',
    itemName: 'Cable tub',
    at: '2026-09-25T09:31:00Z',
    actor: 'device',
    summary: 'Opened',
    undoable: true,
  }),
  screenSizeEvent,
  today({
    id: 'act-07',
    kind: 'created',
    itemId: 'itm-vacuum',
    itemName: 'Stick vacuum',
    at: '2026-09-25T08:30:00Z',
    actor: 'service',
    summary: 'Created from an order',
    undoable: false,
  }),
];

/** Every event the feed can show, newest first. */
export const activityEvents: readonly EventModel[] = [...morning, ...coreEvents].toSorted((a, b) =>
  b.at.localeCompare(a.at)
);
