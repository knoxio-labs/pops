/**
 * Seeded placement and container events: moves, pick ups, put backs,
 * open and close, split and quantity changes.
 */
import type { EventSeed } from './event-seed';

/** Placement and quantity events for the named fixtures. */
export const placementEventSeeds: readonly EventSeed[] = [
  {
    kind: 'moved',
    itemId: 'box-k12',
    itemName: 'Kitchen 12',
    at: '2026-09-24T18:10:00Z',
    summary: 'Moved to Garage',
    before: 'Kitchen',
    after: 'Garage',
    undoable: true,
  },
  {
    kind: 'closed',
    itemId: 'box-k12',
    itemName: 'Kitchen 12',
    at: '2026-09-24T18:02:00Z',
    summary: 'Closed',
    undoable: true,
    actor: 'device',
  },
  {
    kind: 'picked-up',
    itemId: 'itm-tape',
    itemName: 'Tape measure',
    at: '2026-09-24T16:40:00Z',
    summary: 'Picked up from Red toolbox',
    undoable: true,
    actor: 'device',
  },
  {
    kind: 'put-back',
    itemId: 'itm-drill',
    itemName: 'Cordless drill',
    at: '2026-09-24T16:35:00Z',
    summary: 'Put back on Workbench',
    undoable: true,
  },
  {
    kind: 'opened',
    itemId: 'box-k13',
    itemName: 'Kitchen 13',
    at: '2026-09-23T20:15:00Z',
    summary: 'Opened',
    undoable: true,
  },
  {
    kind: 'quantity-changed',
    itemId: 'itm-mugs',
    itemName: 'Mugs',
    at: '2026-09-20T19:45:00Z',
    summary: 'Quantity 8 to 6',
    before: '8',
    after: '6',
    undoable: true,
  },
  {
    kind: 'split',
    itemId: 'itm-plates',
    itemName: 'Dinner plates',
    at: '2026-09-20T19:40:00Z',
    summary: 'Split 4 into a new item',
    undoable: true,
  },
];
