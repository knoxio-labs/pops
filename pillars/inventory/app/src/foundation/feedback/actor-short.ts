import type { EventActor } from '../model/model';

/** Short actor names for inventory activity rows. */
export const ACTOR_SHORT: Readonly<Record<EventActor, string>> = {
  web: 'Web',
  device: 'iPhone',
  service: 'Purchases',
  migration: 'Catalogue',
};
