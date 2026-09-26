import type {
  ItemRowModel,
  LocationModel,
  Placement,
  PlacementTarget,
  PreviousPlacement,
} from './model';

/** An indexed snapshot used to answer placement questions consistently. */
export interface PlacementWorld {
  items: ReadonlyMap<string, ItemRowModel>;
  locations: ReadonlyMap<string, LocationModel>;
}

/** One root-first segment of a resolved placement path. */
export interface PathSegment {
  kind: 'location' | 'container' | 'in-hand' | 'deleted' | 'missing';
  id: string | null;
  name: string;
}

const MAX_HOPS = 32;

/** Indexes item and location snapshots by ID. Later duplicate IDs replace earlier entries. */
export function buildWorld(
  items: readonly ItemRowModel[],
  locations: readonly LocationModel[]
): PlacementWorld {
  return {
    items: new Map(items.map((item) => [item.id, item])),
    locations: new Map(locations.map((location) => [location.id, location])),
  };
}

/** Returns root-first location ancestors including the requested location, or empty if unknown. */
export function locationPath(world: PlacementWorld, locationId: string): LocationModel[] {
  const path: LocationModel[] = [];
  const seen = new Set<string>();
  let cursor: string | null = locationId;

  for (let hops = 0; cursor !== null && hops < MAX_HOPS; hops += 1) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const node = world.locations.get(cursor);
    if (node === undefined) break;
    path.unshift(node);
    cursor = node.parentId;
  }

  return path;
}

function locationSegments(world: PlacementWorld, locationId: string): PathSegment[] {
  const path = locationPath(world, locationId);
  if (path.length === 0) return [{ kind: 'missing', id: locationId, name: 'Unknown place' }];
  return path.map((node) => ({ kind: 'location', id: node.id, name: node.name }));
}

/**
 * Resolves a placement root first: locations followed by containers from the
 * outermost inward. A broken reference is represented by a missing segment.
 */
export function placementTrail(world: PlacementWorld, placement: Placement): PathSegment[] {
  if (placement.kind === 'in-hand') return [{ kind: 'in-hand', id: null, name: 'In hand' }];
  if (placement.kind === 'location') return locationSegments(world, placement.locationId);

  const containers: PathSegment[] = [];
  const seen = new Set<string>();
  let current: Placement = placement;

  for (let hops = 0; current.kind === 'container' && hops < MAX_HOPS; hops += 1) {
    if (seen.has(current.containerId)) break;
    seen.add(current.containerId);
    const container = world.items.get(current.containerId);
    if (container === undefined) {
      return [
        { kind: 'missing', id: current.containerId, name: 'Unknown container' },
        ...containers,
      ];
    }
    containers.unshift({ kind: 'container', id: container.id, name: container.name });
    current = container.placement;
  }

  if (current.kind === 'location') {
    return [...locationSegments(world, current.locationId), ...containers];
  }
  if (current.kind === 'in-hand') {
    return [{ kind: 'in-hand', id: null, name: 'In hand' }, ...containers];
  }
  return containers;
}

/** Resolves a previous placement, preserving only the remembered name of a deleted place. */
export function previousTrail(world: PlacementWorld, previous: PreviousPlacement): PathSegment[] {
  if (previous.kind === 'deleted') return [{ kind: 'deleted', id: null, name: previous.name }];
  return placementTrail(world, previous);
}

/** Returns an item's effective location after following containers, or null if unresolved. */
export function effectiveLocationId(world: PlacementWorld, itemId: string): string | null {
  const item = world.items.get(itemId);
  if (item === undefined) return null;
  const location = placementTrail(world, item.placement)
    .filter((segment) => segment.kind === 'location')
    .at(-1);
  return location?.id ?? null;
}

/** Returns items directly inside a container, ordered by display name. */
export function directContents(world: PlacementWorld, containerId: string): ItemRowModel[] {
  return [...world.items.values()]
    .filter(
      (item) => item.placement.kind === 'container' && item.placement.containerId === containerId
    )
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

/** Returns all nested container contents in depth-first display order. */
export function deepContents(world: PlacementWorld, containerId: string): ItemRowModel[] {
  const seen = new Set<string>([containerId]);
  const contents: ItemRowModel[] = [];

  const walk = (id: string): void => {
    for (const child of directContents(world, id)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      contents.push(child);
      if (child.container !== null) walk(child.id);
    }
  };

  walk(containerId);
  return contents;
}

/** Returns whether a container is the item itself or nested anywhere inside it. */
export function isWithin(world: PlacementWorld, containerId: string, itemId: string): boolean {
  if (containerId === itemId) return true;
  return deepContents(world, itemId).some((inside) => inside.id === containerId);
}

/** Returns whether a location is the ancestor itself or one of its descendants. */
export function isLocationWithin(
  world: PlacementWorld,
  locationId: string,
  ancestorId: string
): boolean {
  return locationPath(world, locationId).some((node) => node.id === ancestorId);
}

/** Returns whether two placement values identify the same destination. */
export function samePlacement(current: Placement, target: PlacementTarget): boolean {
  if (current.kind === 'in-hand' || target.kind === 'in-hand') return current.kind === target.kind;
  if (current.kind === 'location' && target.kind === 'location') {
    return current.locationId === target.locationId;
  }
  if (current.kind === 'container' && target.kind === 'container') {
    return current.containerId === target.containerId;
  }
  return false;
}

/** Returns a target's display name, with stable fallback copy for missing references. */
export function targetName(world: PlacementWorld, target: PlacementTarget): string {
  if (target.kind === 'in-hand') return 'In hand';
  if (target.kind === 'location') {
    return world.locations.get(target.locationId)?.name ?? 'Unknown place';
  }
  return world.items.get(target.containerId)?.name ?? 'Unknown container';
}
