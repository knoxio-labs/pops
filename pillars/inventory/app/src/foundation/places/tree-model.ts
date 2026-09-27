import { buildWorld, isLocationWithin } from '../model/placement-model.js';

import type { LocationKind, LocationModel } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';

/** Returns direct children in the order stored by the location tree. */
export function childPlaces(world: PlacementWorld, parentId: string | null): LocationModel[] {
  return [...world.locations.values()].filter((node) => node.parentId === parentId);
}

/** Returns a place and all descendants in parent-first tree order. */
export function subtreeIds(world: PlacementWorld, placeId: string): string[] {
  if (!world.locations.has(placeId)) return [];
  const ids = [placeId];
  for (const child of childPlaces(world, placeId)) ids.push(...subtreeIds(world, child.id));
  return ids;
}

/** The result of validating a place edit. */
export type PlaceVerdict = { ok: true } | { ok: false; reason: string };

/** Validates moving a place under a parent, or to the root when parentId is null. */
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

/** Returns the validation message for a new or renamed sibling, or null when valid. */
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

/** Infers the next useful semantic kind for a child place. */
export function kindForChild(parent: LocationModel | null): LocationKind {
  if (parent === null) return 'property';
  if (parent.kind === 'property') return 'room';
  if (parent.kind === 'room') return 'furniture';
  return 'storage';
}

function withLocations(world: PlacementWorld, locations: readonly LocationModel[]): PlacementWorld {
  return buildWorld([...world.items.values()], locations);
}

function insertAfterSubtree(
  nodes: readonly LocationModel[],
  world: PlacementWorld,
  targetId: string
): number {
  const index = nodes.findIndex((node) => node.id === targetId);
  if (index < 0) return nodes.length;
  const targetSubtree = new Set(subtreeIds(world, targetId));
  let insertion = index + 1;
  while (insertion < nodes.length && targetSubtree.has(nodes[insertion]?.id ?? '')) {
    insertion += 1;
  }
  return insertion;
}

function appendChild(
  world: PlacementWorld,
  locations: readonly LocationModel[],
  parentId: string | null,
  node: LocationModel
): LocationModel[] {
  if (parentId === null) return [...locations, node];
  const rest = [...locations];
  rest.splice(insertAfterSubtree(rest, world, parentId), 0, node);
  return rest;
}

/** Adds a new place at the end of its parent's children when its name is valid. */
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
  return withLocations(
    world,
    appendChild(world, [...world.locations.values()], node.parentId, node)
  );
}

/** Renames a place after applying sibling and whitespace validation. */
export function renamePlace(world: PlacementWorld, placeId: string, name: string): PlacementWorld {
  const place = world.locations.get(placeId);
  if (place === undefined || placeNameProblem(world, place.parentId, name, placeId) !== null) {
    return world;
  }
  return withLocations(
    world,
    [...world.locations.values()].map((node) =>
      node.id === placeId ? { ...node, name: name.trim() } : node
    )
  );
}

/** The three positions a dragged place may take relative to a target row. */
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

/** Validates dropping a place before, after, or inside a target row. */
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

function insertionIndex(
  nodes: readonly LocationModel[],
  world: PlacementWorld,
  targetId: string,
  position: DropPosition
): number {
  if (position === 'inside') return insertAfterSubtree(nodes, world, targetId);
  const index = nodes.findIndex((node) => node.id === targetId);
  if (index < 0) return nodes.length;
  if (position === 'before') return index;
  return index + 1;
}

/** Moves a place and its complete subtree to a row-relative position. */
export function dropPlace(
  world: PlacementWorld,
  placeId: string,
  targetId: string,
  position: DropPosition
): PlacementWorld {
  if (!dropPlaceVerdict(world, placeId, targetId, position).ok) return world;
  const moved = world.locations.get(placeId);
  const parentId = parentAfterDrop(world, targetId, position);
  if (moved === undefined || parentId === undefined) return world;

  const movedIds = new Set(subtreeIds(world, placeId));
  const block = [...world.locations.values()]
    .filter((node) => movedIds.has(node.id))
    .map((node) => (node.id === placeId ? { ...node, parentId } : node));
  const rest = [...world.locations.values()].filter((node) => !movedIds.has(node.id));
  rest.splice(insertionIndex(rest, world, targetId, position), 0, ...block);
  return withLocations(world, rest);
}

/** Moves a place to the end of a parent's children, or to the end of root places. */
export function movePlace(
  world: PlacementWorld,
  placeId: string,
  parentId: string | null
): PlacementWorld {
  const place = world.locations.get(placeId);
  if (place === undefined || !placeMoveVerdict(world, placeId, parentId).ok) return world;
  const movedIds = new Set(subtreeIds(world, placeId));
  const block = [...world.locations.values()]
    .filter((node) => movedIds.has(node.id))
    .map((node) => (node.id === placeId ? { ...node, parentId } : node));
  const rest = [...world.locations.values()].filter((node) => !movedIds.has(node.id));
  const insertion = parentId === null ? rest.length : insertAfterSubtree(rest, world, parentId);
  rest.splice(insertion, 0, ...block);
  return withLocations(world, rest);
}
