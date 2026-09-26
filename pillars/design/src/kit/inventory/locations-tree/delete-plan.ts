/**
 * What deleting a place does to everything in it, worked out before the
 * button is pressed (ADR-002). There are two ways to delete a place that
 * holds things: move its contents up to its parent, or delete it with
 * everything under it and put the loose things in hand, each remembering
 * "Previous place deleted". Boxes keep their contents either way.
 */
import { buildWorld, deepContents } from '../foundation';
import { childPlaces, subtreeIds } from './tree-model';

import type { ItemRowModel, LocationModel, PlacementWorld } from '../foundation';

/** `reparent`: contents move up a level. `to-hand`: the place goes with its sub-places. */
export type DeleteMode = 'reparent' | 'to-hand';

/** The computed outcome of one delete. */
export interface DeletePlan {
  place: LocationModel;
  mode: DeleteMode;
  /** Where contents go in `reparent` mode. Null for a top-level place. */
  parent: LocationModel | null;
  /** Places deleted along with this one (`to-hand` only). */
  deletedPlaces: LocationModel[];
  /** Places that move up to the parent (`reparent` only). */
  movedPlaces: LocationModel[];
  /** Things that change placement: items and boxes sitting directly in a deleted place. */
  things: ItemRowModel[];
  /** Things riding inside those boxes, which stay where they are inside them. */
  carried: number;
  /** Why this mode cannot run, when it cannot. */
  refusal: string | null;
}

/** Whether the place holds nothing at all, so deleting it needs no decision. */
export function isEmptyPlace(world: PlacementWorld, placeId: string): boolean {
  if (childPlaces(world, placeId).length > 0) return false;
  return ![...world.items.values()].some(
    (entry) => entry.placement.kind === 'location' && entry.placement.locationId === placeId
  );
}

function thingsDirectlyIn(world: PlacementWorld, placeIds: ReadonlySet<string>): ItemRowModel[] {
  return [...world.items.values()].filter(
    (entry) => entry.placement.kind === 'location' && placeIds.has(entry.placement.locationId)
  );
}

function carriedBy(world: PlacementWorld, things: readonly ItemRowModel[]): number {
  return things
    .filter((entry) => entry.container !== null)
    .reduce((sum, box) => sum + deepContents(world, box.id).length, 0);
}

/** Plans deleting `placeId` in `mode`. Unknown places throw: a screen must not offer them. */
export function planDelete(world: PlacementWorld, placeId: string, mode: DeleteMode): DeletePlan {
  const place = world.locations.get(placeId);
  if (place === undefined) throw new Error(`No place ${placeId}`);
  const parent = place.parentId === null ? null : (world.locations.get(place.parentId) ?? null);
  const scope = new Set(mode === 'to-hand' ? subtreeIds(world, placeId) : [placeId]);
  const things = thingsDirectlyIn(world, scope);
  const refusal =
    mode === 'reparent' && parent === null
      ? `${place.name} is a top-level place, so there is nowhere above it to move things to.`
      : null;
  return {
    place,
    mode,
    parent,
    deletedPlaces: mode === 'to-hand' ? [...scope].slice(1).flatMap(lookup(world)) : [],
    movedPlaces: mode === 'reparent' ? childPlaces(world, placeId) : [],
    things,
    carried: carriedBy(world, things),
    refusal,
  };
}

function lookup(world: PlacementWorld): (id: string) => LocationModel[] {
  return (id) => {
    const node = world.locations.get(id);
    return node ? [node] : [];
  };
}

function relocate(plan: DeletePlan, world: PlacementWorld): (entry: ItemRowModel) => ItemRowModel {
  const moving = new Set(plan.things.map((entry) => entry.id));
  return (entry) => {
    if (!moving.has(entry.id) || entry.placement.kind !== 'location') return entry;
    if (plan.mode === 'reparent' && plan.parent !== null) {
      return { ...entry, placement: { kind: 'location', locationId: plan.parent.id } };
    }
    const was = world.locations.get(entry.placement.locationId)?.name ?? plan.place.name;
    return { ...entry, placement: { kind: 'in-hand' }, previous: { kind: 'deleted', name: was } };
  };
}

/** Applies a plan. A refused plan changes nothing. */
export function applyDelete(world: PlacementWorld, plan: DeletePlan): PlacementWorld {
  if (plan.refusal !== null) return world;
  const gone = new Set([plan.place.id, ...plan.deletedPlaces.map((node) => node.id)]);
  const locations = [...world.locations.values()]
    .filter((node) => !gone.has(node.id))
    .map((node) =>
      node.parentId === plan.place.id ? { ...node, parentId: plan.place.parentId } : node
    );
  return buildWorld([...world.items.values()].map(relocate(plan, world)), locations);
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The destructive button's label, carrying the real outcome. */
export function deleteButtonLabel(plan: DeletePlan): string {
  if (plan.mode === 'reparent') {
    const moved = plan.things.length + plan.movedPlaces.length;
    if (moved === 0 || plan.parent === null) return `Delete ${plan.place.name}`;
    return `Delete and move ${moved} to ${plan.parent.name}`;
  }
  if (plan.things.length === 0) return `Delete ${plan.place.name}`;
  return `Delete and put ${plan.things.length} in hand`;
}

function keepsInside(carried: number): string {
  if (carried === 0) return '';
  return ` Boxes keep the ${count(carried, 'thing', 'things')} inside them.`;
}

/** The sentences stating what a plan does, for the option it belongs to. */
export function deleteOutcome(plan: DeletePlan): string {
  const things = count(plan.things.length, 'thing', 'things');
  if (plan.mode === 'reparent') {
    const places = plan.movedPlaces.length;
    const list = places > 0 ? `${count(places, 'place', 'places')} and ${things}` : things;
    return `${list} move up to ${plan.parent?.name ?? 'the top level'}.${keepsInside(plan.carried)}`;
  }
  const under = plan.deletedPlaces.length;
  const gone =
    under > 0
      ? `${plan.place.name} and ${count(under, 'place', 'places')} under it are deleted.`
      : `${plan.place.name} is deleted.`;
  return `${gone} ${things} go in hand, marked Previous place deleted.${keepsInside(plan.carried)}`;
}
