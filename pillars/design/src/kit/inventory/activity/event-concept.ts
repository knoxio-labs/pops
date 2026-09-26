/**
 * Where a change came from, in the few letters a feed row has room for.
 */
import type { EventActor } from '../shared/model';

/** Short actor names for a row: where the change came from. */
export const ACTOR_SHORT: Readonly<Record<EventActor, string>> = {
  web: 'Web',
  device: 'iPhone',
  service: 'Purchases',
  migration: 'Catalogue',
};
