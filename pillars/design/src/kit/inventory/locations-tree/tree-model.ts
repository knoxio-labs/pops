/**
 * The location tree as data: order, subtrees, what each place holds, and the
 * four edits a place takes (create, rename, move, reorder). Locations are
 * fixed places with no type, so every rule here is about the tree itself;
 * what happens to items when a place goes is in `delete-plan.ts`.
 */
import { buildWorld, effectiveLocationId, isLocationWithin } from '../foundation';

import type { ItemRowModel, LocationKind, LocationModel, PlacementWorld } from '../foundation';

/** Direct children of a place (or the roots for `null`), in tree order. */
export function childPlaces(world: PlacementWorld, parentId: string | null): LocationModel[] {
  return [...world.locations.values()].filter((node) => node.parentId === parentId);
}

/** A place and every place under it, parents before children. */
export function subtreeIds(world: PlacementWorld, placeId: string): string[] {
  if (!world.locations.has(placeId)) return [];
  const out = [placeId];
  for (const child of childPlaces(world, placeId)) out.push(...subtreeIds(world, child.id));
  return out;
}

/** What one place holds, counting active things only. */
export interface PlaceTally {
  /** Places directly inside. */
  places: number;
  /** Items sitting directly here, not in a box. */
  itemsHere: number;
  /** Containers sitting directly here. */
  boxesHere: number;
  /** Everything inside those containers, nested boxes included. */
  inBoxes: number;
  /** Every active thing whose effective place is here or under here. */
  total: number;
}

const active = (entry: ItemRowModel): boolean => entry.lifecycle === 'active';

function directlyAt(entry: ItemRowModel, placeId: string): boolean {
  return entry.placement.kind === 'location' && entry.placement.locationId === placeId;
}

/** Counts for one place. */
export function tallyPlace(world: PlacementWorld, placeId: string): PlaceTally {
  const items = [...world.items.values()].filter(active);
  const here = items.filter((entry) => directlyAt(entry, placeId));
  const boxIds = new Set(here.filter((entry) => entry.container !== null).map((b) => b.id));
  const insideBox = (entry: ItemRowModel): boolean => {
    const where = effectiveLocationId(world, entry.id);
    return where === placeId && !directlyAt(entry, placeId) && entry.placement.kind !== 'in-hand';
  };
  return {
    places: childPlaces(world, placeId).length,
    itemsHere: here.length - boxIds.size,
    boxesHere: boxIds.size,
    inBoxes: items.filter(insideBox).length,
    total: items.filter((entry) => {
      const where = effectiveLocationId(world, entry.id);
      return where !== null && isLocationWithin(world, where, placeId);
    }).length,
  };
}

/** A place edit's answer: allowed, or refused with the sentence that says why. */
export type PlaceVerdict = { ok: true } | { ok: false; reason: string };

/** Whether `placeId` may sit under `parentId` (null: top level). */
export function placeMoveVerdict(
  world: PlacementWorld,
  placeId: string,
  parentId: string | null
): PlaceVerdict {
  const place = world.locations.get(placeId);
  if (place === undefined) return { ok: false, reason: 'That place no longer exists.' };
  if (parentId === placeId) return { ok: false, reason: 'Cannot go inside itself.' };
  if (parentId !== null) {
    const parent = world.locations.get(parentId);
    if (parent === undefined) return { ok: false, reason: 'That place no longer exists.' };
    if (isLocationWithin(world, parentId, placeId)) {
      return { ok: false, reason: `${parent.name} is inside ${place.name}.` };
    }
  }
  if (place.parentId === parentId) return { ok: false, reason: 'Already there.' };
  return { ok: true };
}

/** Why a name cannot be used under `parentId`, or null when it can. */
export function placeNameProblem(
  world: PlacementWorld,
  parentId: string | null,
  name: string,
  exceptId: string | null = null
): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Give the place a name.';
  const clash = childPlaces(world, parentId).find(
    (node) => node.id !== exceptId && node.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (clash === undefined) return null;
  const parent = parentId === null ? null : world.locations.get(parentId);
  return `${parent?.name ?? 'The top level'} already has a place called ${clash.name}.`;
}

/** The kind a new place under `parent` most likely is: rooms in a property, and so on. */
export function kindForChild(parent: LocationModel | null): LocationKind {
  if (parent === null) return 'property';
  if (parent.kind === 'property') return 'room';
  if (parent.kind === 'room') return 'furniture';
  return 'storage';
}

function withLocations(world: PlacementWorld, locations: LocationModel[]): PlacementWorld {
  return buildWorld([...world.items.values()], locations);
}

/** Adds a place as the last child of its parent. Refuses a bad name by returning the world as it was. */
export function createPlace(
  world: PlacementWorld,
  place: Omit<LocationModel, 'kind'> & { kind?: LocationKind }
): PlacementWorld {
  if (world.locations.has(place.id)) return world;
  if (placeNameProblem(world, place.parentId, place.name) !== null) return world;
  const parent = place.parentId === null ? null : (world.locations.get(place.parentId) ?? null);
  const node: LocationModel = {
    ...place,
    name: place.name.trim(),
    kind: place.kind ?? kindForChild(parent),
  };
  return withLocations(world, [...world.locations.values(), node]);
}

/** Renames a place; a bad name leaves the world unchanged. */
export function renamePlace(world: PlacementWorld, placeId: string, name: string): PlacementWorld {
  const place = world.locations.get(placeId);
  if (place === undefined) return world;
  if (placeNameProblem(world, place.parentId, name, placeId) !== null) return world;
  const nodes = [...world.locations.values()].map((node) =>
    node.id === placeId ? { ...node, name: name.trim() } : node
  );
  return withLocations(world, nodes);
}

/** Where a dragged place lands relative to the node it is dropped on. */
export type DropPosition = 'before' | 'after' | 'inside';

function parentAfterDrop(
  world: PlacementWorld,
  targetId: string,
  position: DropPosition
): string | null | undefined {
  const target = world.locations.get(targetId);
  if (target === undefined) return undefined;
  return position === 'inside' ? target.id : target.parentId;
}

/** Whether dropping `placeId` at `position` of `targetId` is allowed. */
export function dropPlaceVerdict(
  world: PlacementWorld,
  placeId: string,
  targetId: string,
  position: DropPosition
): PlaceVerdict {
  const parentId = parentAfterDrop(world, targetId, position);
  if (parentId === undefined) return { ok: false, reason: 'That place no longer exists.' };
  if (targetId === placeId) return { ok: false, reason: 'Cannot go inside itself.' };
  const verdict = placeMoveVerdict(world, placeId, parentId);
  const reordering = !verdict.ok && verdict.reason === 'Already there.' && position !== 'inside';
  return reordering ? { ok: true } : verdict;
}

function insertAt(
  nodes: readonly LocationModel[],
  targetId: string,
  position: DropPosition
): number {
  if (position === 'inside') return nodes.length;
  const at = nodes.findIndex((node) => node.id === targetId);
  return position === 'before' ? at : at + 1;
}

/** Moves a place: under a node (`inside`) or beside it, keeping its whole subtree. */
export function dropPlace(
  world: PlacementWorld,
  placeId: string,
  targetId: string,
  position: DropPosition
): PlacementWorld {
  if (!dropPlaceVerdict(world, placeId, targetId, position).ok) return world;
  const parentId = parentAfterDrop(world, targetId, position) ?? null;
  const moved = world.locations.get(placeId);
  if (moved === undefined) return world;
  const rest = [...world.locations.values()].filter((node) => node.id !== placeId);
  rest.splice(insertAt(rest, targetId, position), 0, { ...moved, parentId });
  return withLocations(world, rest);
}

/** Moves a place under `parentId` (null: top level), as its last child. */
export function movePlace(
  world: PlacementWorld,
  placeId: string,
  parentId: string | null
): PlacementWorld {
  const place = world.locations.get(placeId);
  if (place === undefined || !placeMoveVerdict(world, placeId, parentId).ok) return world;
  const rest = [...world.locations.values()].filter((node) => node.id !== placeId);
  return withLocations(world, [...rest, { ...place, parentId }]);
}
