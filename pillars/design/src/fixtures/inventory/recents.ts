/**
 * What "recent" means on this pillar: the last queries typed, the records
 * last opened, and the places things were last put. The palette, the TopBar
 * dropdown and the placement picker all read from here.
 */
import type { PlacementTarget } from '@/kit/inventory/shared/model';

/** A query someone ran, newest first. */
export const recentQueries: readonly string[] = ['hdmi', 'kitchen 12', 'drill bits', 'K13'];

/** Records opened recently, newest first, by id. */
export const recentRecordIds: readonly string[] = ['box-k12', 'itm-tv', 'loc-garage', 'itm-drill'];

/** Places things were last put, newest first. The picker shows the first four. */
export const recentPlacements: readonly PlacementTarget[] = [
  { kind: 'container', containerId: 'box-k13' },
  { kind: 'location', locationId: 'loc-desk' },
  { kind: 'location', locationId: 'loc-shelving' },
  { kind: 'container', containerId: 'box-cables' },
  { kind: 'location', locationId: 'loc-pantry' },
];
