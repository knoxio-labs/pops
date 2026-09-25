/**
 * The concept symbol each history event is drawn with, so a move looks the
 * same in Recent work, the Activity feed and an item's history.
 */
import type { InventoryConcept } from '../shared/icons';
import type { EventActor, EventKind } from '../shared/model';

/** Event kind to concept. */
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

/** Short actor names for a row: where the change came from. */
export const ACTOR_SHORT: Readonly<Record<EventActor, string>> = {
  web: 'Web',
  device: 'iPhone',
  service: 'Purchases',
  migration: 'Catalogue',
};
