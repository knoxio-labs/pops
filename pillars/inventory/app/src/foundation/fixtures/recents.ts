/**
 * Recent queries, records, and placement targets used by foundation fixtures.
 */
import type { PlacementTarget } from '../model/model';

/** Queries in newest-first order. */
export const recentQueries: readonly string[] = ['hdmi', 'kitchen 12', 'drill bits', 'K13'];

/** Recently opened record IDs in newest-first order. */
export const recentRecordIds: readonly string[] = ['box-k12', 'itm-tv', 'loc-garage', 'itm-drill'];

/** Recently used placement targets in newest-first order. */
export const recentPlacements: readonly PlacementTarget[] = [
  { kind: 'container', containerId: 'box-k13' },
  { kind: 'location', locationId: 'loc-desk' },
  { kind: 'location', locationId: 'loc-shelving' },
  { kind: 'container', containerId: 'box-cables' },
  { kind: 'location', locationId: 'loc-pantry' },
];
