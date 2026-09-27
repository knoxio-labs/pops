import { locationPath } from '../../foundation/model/placement-model.js';
import { isFiltered } from './fixture-filter.js';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { FixturesGetResponses, FixturesListResponse } from '../../inventory-api/types.gen.js';
import type { FixtureFilter } from './fixture-filter.js';

export { isFiltered, NO_FIXTURE_FILTER, wiredSummary } from './fixture-filter.js';
export type { FixtureFilter } from './fixture-filter.js';

/** One server-owned row in the fixture list. */
export type FixtureListRow = FixturesListResponse['data'][number];

/** One server-owned fixture returned by the detail endpoint. */
export type FixtureDetail = FixturesGetResponses[200]['data'];

/** The request state used by the fixture detail shell. */
export type FixtureDetailStatus = 'pending' | 'error' | 'success';

/** Resolves detail status without hiding a wired-item or fixture request failure. */
export function fixtureDetailStatus(loading: boolean, error: unknown): FixtureDetailStatus {
  if (loading) return 'pending';
  if (error !== null) return 'error';
  return 'success';
}

/** Returns whether a fixture list filter narrows the server request. */
export function isFixtureFiltered(filter: FixtureFilter): boolean {
  return isFiltered(filter);
}

/** Resolves a fixture's room label from the already-loaded location tree. */
export function fixtureRoomName(
  locations: ReadonlyMap<string, LocationModel>,
  locationId: string | null
): string {
  return locationId === null ? '' : (locations.get(locationId)?.name ?? '');
}

/** Resolves a fixture's full room path for the detail facts rail. */
export function fixtureRoomPath(
  locations: ReadonlyMap<string, LocationModel>,
  locationId: string | null
): string {
  if (locationId === null) return 'an unknown place';
  const world: PlacementWorld = { items: new Map(), locations };
  const path = locationPath(world, locationId).map((location) => location.name);
  return path.length > 0 ? path.join(' / ') : 'an unknown place';
}

/** Converts a location tree lookup into the option labels used by the fixture form. */
export function fixtureLocationOptions(
  locations: readonly LocationModel[]
): readonly { value: string; label: string }[] {
  const byId = new Map(locations.map((location) => [location.id, location] as const));
  return locations
    .map((location) => {
      const path: string[] = [];
      const seen = new Set<string>();
      let current: LocationModel | undefined = location;
      while (current !== undefined && !seen.has(current.id)) {
        seen.add(current.id);
        path.unshift(current.name);
        current = current.parentId === null ? undefined : byId.get(current.parentId);
      }
      return { value: location.id, label: path.join(' / ') };
    })
    .toSorted((left, right) => left.label.localeCompare(right.label));
}
