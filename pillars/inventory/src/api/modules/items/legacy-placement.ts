/**
 * Translates the legacy item API's `locationId` / `containerId` pair into the
 * placement the command layer expects (Inventory ADR-002 D2), so the old
 * routes keep their request shape while writing through `item.create` and
 * `item.move` (POPS-4053).
 */
import type { ItemRow } from '../../../db/index.js';
import type { Placement } from '../../../domain/commands/index.js';

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

/**
 * The wire `Placement` a legacy create should send to `item.create`
 * (POPS-4053), or `undefined` to leave `item.placement` at its `hand`
 * default: the command layer computes the columns and previous placement
 * itself, so this needs none of {@link PlacementColumns}' bookkeeping.
 */
export function wirePlacementForCreate(input: LegacyPlacementInput): Placement | undefined {
  if (typeof input.containerId === 'string')
    return { kind: 'container', itemId: input.containerId };
  if (typeof input.locationId === 'string')
    return { kind: 'location', locationId: input.locationId };
  return undefined;
}

/**
 * The wire `Placement` a legacy update should send to `item.move`
 * (POPS-4053), or `undefined` when the update names no placement change at
 * all: clearing a reference that does not currently hold the item is a
 * no-op.
 */
export function wirePlacementForUpdate(
  current: Pick<PlacementColumns, 'placementKind' | 'locationId' | 'containingItemId'>,
  input: LegacyPlacementInput
): Placement | undefined {
  if (typeof input.containerId === 'string')
    return { kind: 'container', itemId: input.containerId };
  if (typeof input.locationId === 'string')
    return { kind: 'location', locationId: input.locationId };
  const clearsContainer = input.containerId === null && current.placementKind === 'container';
  const clearsLocation = input.locationId === null && current.placementKind === 'location';
  if (clearsContainer || clearsLocation) return { kind: 'hand' };
  return undefined;
}
