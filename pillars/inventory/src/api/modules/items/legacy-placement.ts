/**
 * Translates the legacy item API's `locationId` / `containerId` pair into the
 * explicit placement columns of `items` (Inventory ADR-002 D2), so the old
 * routes keep their request shape until slice A7 moves them onto commands.
 */
import type { ItemRow } from '../../../db/index.js';

/** The six placement columns of an `items` row, which `ck_items_placement` and
 * `ck_items_previous_placement` constrain together. */
export type PlacementColumns = Pick<
  ItemRow,
  | 'placementKind'
  | 'locationId'
  | 'containingItemId'
  | 'previousPlacementKind'
  | 'previousLocationId'
  | 'previousContainingItemId'
>;

/** The legacy request fields that decide placement. `null` clears, absent keeps. */
export interface LegacyPlacementInput {
  locationId?: string | null;
  containerId?: string | null;
}

const NO_PREVIOUS = {
  previousPlacementKind: null,
  previousLocationId: null,
  previousContainingItemId: null,
} as const;

function atLocation(locationId: string): PlacementColumns {
  return { placementKind: 'location', locationId, containingItemId: null, ...NO_PREVIOUS };
}

function inContainer(containerId: string): PlacementColumns {
  return {
    placementKind: 'container',
    locationId: null,
    containingItemId: containerId,
    ...NO_PREVIOUS,
  };
}

/** In hand, remembering where the item was taken from (or what it already remembered). */
function pickedUpFrom(current: PlacementColumns): PlacementColumns {
  const base = { placementKind: 'hand', locationId: null, containingItemId: null } as const;
  if (current.placementKind === 'location' && current.locationId !== null) {
    return {
      ...base,
      previousPlacementKind: 'location',
      previousLocationId: current.locationId,
      previousContainingItemId: null,
    };
  }
  if (current.placementKind === 'container' && current.containingItemId !== null) {
    return {
      ...base,
      previousPlacementKind: 'container',
      previousLocationId: null,
      previousContainingItemId: current.containingItemId,
    };
  }
  return { ...current };
}

/**
 * Placement of a new item: its container when one is named (a container is
 * authoritative over a location sent alongside it, as it was before ADR-002),
 * else its location, else in hand with nothing remembered.
 */
export function placementForCreate(input: LegacyPlacementInput): PlacementColumns {
  if (typeof input.containerId === 'string') return inContainer(input.containerId);
  if (typeof input.locationId === 'string') return atLocation(input.locationId);
  return { placementKind: 'hand', locationId: null, containingItemId: null, ...NO_PREVIOUS };
}

/**
 * Placement after a legacy update, or `null` when the update leaves it alone.
 *
 * A named container wins; a named location places the item there and takes it
 * out of any container. Clearing the reference that currently holds the item
 * puts it in hand remembering that place. Clearing a reference that does not
 * currently hold it (`locationId: null` on a contained item, say) is a no-op,
 * because the placement row already has that column null.
 */
export function placementForUpdate(
  current: PlacementColumns,
  input: LegacyPlacementInput
): PlacementColumns | null {
  if (typeof input.containerId === 'string') return inContainer(input.containerId);
  if (typeof input.locationId === 'string') return atLocation(input.locationId);

  const clearsContainer = input.containerId === null && current.placementKind === 'container';
  const clearsLocation = input.locationId === null && current.placementKind === 'location';
  if (clearsContainer || clearsLocation) return pickedUpFrom(current);
  return null;
}
