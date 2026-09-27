import { buildWorld, deepContents } from '../model/placement-model.js';
import { childPlaces, subtreeIds } from './tree-model.js';

import type { ItemRowModel, LocationModel } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';

/** The two supported outcomes when deleting a non-empty place. */
export type DeleteMode = 'reparent' | 'to-hand';

/** The fully described placement and location outcome of a delete. */
export interface DeletePlan {
  place: LocationModel;
  mode: DeleteMode;
  parent: LocationModel | null;
  deletedPlaces: LocationModel[];
  movedPlaces: LocationModel[];
  things: ItemRowModel[];
  carried: number;
  refusal: string | null;
}

/** Returns true only when a place has no child place and no direct item. */
export function isEmptyPlace(world: PlacementWorld, placeId: string): boolean {
  if (childPlaces(world, placeId).length > 0) return false;
  return ![...world.items.values()].some(
    (item) => item.placement.kind === 'location' && item.placement.locationId === placeId
  );
}

function directThings(world: PlacementWorld, placeIds: ReadonlySet<string>): ItemRowModel[] {
  return [...world.items.values()].filter(
    (item) => item.placement.kind === 'location' && placeIds.has(item.placement.locationId)
  );
}

function carriedCount(world: PlacementWorld, things: readonly ItemRowModel[]): number {
  return things
    .filter((item) => item.container !== null)
    .reduce((total, box) => total + deepContents(world, box.id).length, 0);
}

function locationFor(world: PlacementWorld, id: string): LocationModel[] {
  const location = world.locations.get(id);
  return location === undefined ? [] : [location];
}

/** Computes a delete outcome before any destructive request is sent. */
export function planDelete(world: PlacementWorld, placeId: string, mode: DeleteMode): DeletePlan {
  const place = world.locations.get(placeId);
  if (place === undefined) throw new Error(`No place ${placeId}`);
  const parent = place.parentId === null ? null : (world.locations.get(place.parentId) ?? null);
  const scope = new Set(mode === 'to-hand' ? subtreeIds(world, placeId) : [placeId]);
  const things = directThings(world, scope);
  return {
    place,
    mode,
    parent,
    deletedPlaces:
      mode === 'to-hand'
        ? subtreeIds(world, placeId)
            .slice(1)
            .flatMap((id) => locationFor(world, id))
        : [],
    movedPlaces: mode === 'reparent' ? childPlaces(world, placeId) : [],
    things,
    carried: carriedCount(world, things),
    refusal:
      mode === 'reparent' && parent === null
        ? `${place.name} is a top-level place, so there is nowhere above it to move things to.`
        : null,
  };
}

function relocated(plan: DeletePlan, world: PlacementWorld, item: ItemRowModel): ItemRowModel {
  const moving = new Set(plan.things.map((thing) => thing.id));
  if (!moving.has(item.id) || item.placement.kind !== 'location') return item;
  if (plan.mode === 'reparent' && plan.parent !== null) {
    return { ...item, placement: { kind: 'location', locationId: plan.parent.id } };
  }
  const previousName = world.locations.get(item.placement.locationId)?.name ?? plan.place.name;
  return {
    ...item,
    placement: { kind: 'in-hand' },
    previous: { kind: 'deleted', name: previousName },
  };
}

/** Applies a non-refused delete plan to a placement world. */
export function applyDelete(world: PlacementWorld, plan: DeletePlan): PlacementWorld {
  if (plan.refusal !== null) return world;
  const deleted = new Set([plan.place.id, ...plan.deletedPlaces.map((location) => location.id)]);
  const locations = [...world.locations.values()]
    .filter((location) => !deleted.has(location.id))
    .map((location) =>
      location.parentId === plan.place.id
        ? { ...location, parentId: plan.place.parentId }
        : location
    );
  return buildWorld(
    [...world.items.values()].map((item) => relocated(plan, world, item)),
    locations
  );
}

function count(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/** Returns the destructive button label for a selected delete outcome. */
export function deleteButtonLabel(plan: DeletePlan): string {
  if (plan.mode === 'reparent') {
    const moved = plan.things.length + plan.movedPlaces.length;
    if (moved === 0 || plan.parent === null) return `Delete ${plan.place.name}`;
    return `Delete and move ${moved} to ${plan.parent.name}`;
  }
  if (plan.things.length === 0) return `Delete ${plan.place.name}`;
  return `Delete and put ${plan.things.length} in hand`;
}

function carriedLine(carried: number): string {
  return carried === 0 ? '' : ` Boxes keep the ${count(carried, 'thing', 'things')} inside them.`;
}

/** States the location and item consequences of a delete plan in user-facing copy. */
export function deleteOutcome(plan: DeletePlan): string {
  const things = count(plan.things.length, 'thing', 'things');
  if (plan.mode === 'reparent') {
    const places = plan.movedPlaces.length;
    const moved = places > 0 ? `${count(places, 'place', 'places')} and ${things}` : things;
    return `${moved} move up to ${plan.parent?.name ?? 'the top level'}.${carriedLine(plan.carried)}`;
  }
  const descendants = plan.deletedPlaces.length;
  const deleted =
    descendants > 0
      ? `${plan.place.name} and ${count(descendants, 'place', 'places')} under it are deleted.`
      : `${plan.place.name} is deleted.`;
  return `${deleted} ${things} go in hand, marked Previous place deleted.${carriedLine(plan.carried)}`;
}
