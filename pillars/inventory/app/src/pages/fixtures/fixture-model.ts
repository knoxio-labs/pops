import { locationPath } from '../../foundation/model/placement-model.js';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { FixturesGetResponses, FixturesListResponse } from '../../inventory-api/types.gen.js';

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

/** The list filters shown by the fixture browser. */
export interface FixtureFilter {
  readonly q: string;
  readonly kind: string | null;
}

/** The unfiltered fixture browser state. */
export const NO_FIXTURE_FILTER: FixtureFilter = { q: '', kind: null };

/** Returns whether a fixture list filter narrows the server request. */
export function isFixtureFiltered(filter: FixtureFilter): boolean {
  return filter.q.trim().length > 0 || filter.kind !== null;
}

/** Summarizes the server-provided wired item names without inventing rows client-side. */
export function wiredSummary(row: Pick<FixtureListRow, 'wiredCount' | 'wiredNames'>): string {
  if (row.wiredCount === 0) return 'Nothing wired';
  const names = row.wiredNames.slice(0, 2);
  if (names.length === 0) return `${row.wiredCount} wired`;
  if (names.length >= row.wiredCount) return names.join(', ');
  return `${names.join(', ')} and ${row.wiredCount - names.length} more`;
}

/** Resolves a fixture's room label from the already-loaded location tree. */
export function fixtureRoomName(
  locations: ReadonlyMap<string, LocationModel>,
  locationId: string | null
): string {
  if (locationId === null) return 'No room assigned';
  return locations.get(locationId)?.name ?? 'Unknown place';
}

/** Resolves a fixture's full room path for the detail facts rail. */
export function fixtureRoomPath(
  locations: ReadonlyMap<string, LocationModel>,
  locationId: string | null
): string {
  if (locationId === null) return 'No room assigned';
  const world: PlacementWorld = { items: new Map(), locations };
  const path = locationPath(world, locationId).map((location) => location.name);
  return path.length > 0 ? path.join(' / ') : 'Unknown place';
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
