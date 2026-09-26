/**
 * Pure placement arithmetic over one snapshot of items and locations: paths,
 * effective location, contents and cycle checks. Every picker, move plan and
 * drop target answers from these, so they cannot disagree about where
 * something is.
 */
import type {
  ItemRowModel,
  LocationModel,
  Placement,
  PlacementTarget,
  PreviousPlacement,
} from './model';

/** A snapshot to answer placement questions against. */
export interface PlacementWorld {
  items: ReadonlyMap<string, ItemRowModel>;
  locations: ReadonlyMap<string, LocationModel>;
}

/** One hop of a placement path, root first. */
export interface PathSegment {
  kind: 'location' | 'container' | 'in-hand' | 'deleted' | 'missing';
  id: string | null;
  name: string;
}

const MAX_HOPS = 32;

/** Indexes items and locations by id. */
export function buildWorld(
  items: readonly ItemRowModel[],
  locations: readonly LocationModel[]
): PlacementWorld {
  return {
    items: new Map(items.map((item) => [item.id, item])),
    locations: new Map(locations.map((location) => [location.id, location])),
  };
}

/** Root-first ancestors of a location, including itself. Empty when unknown. */
export function locationPath(world: PlacementWorld, locationId: string): LocationModel[] {
  const path: LocationModel[] = [];
  let cursor: string | null = locationId;
  for (let hops = 0; cursor !== null && hops < MAX_HOPS; hops += 1) {
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
 * The full path of a placement, root first: the locations, then each
 * container from the outermost in. In hand is a single segment.
 */
export function placementTrail(world: PlacementWorld, placement: Placement): PathSegment[] {
  if (placement.kind === 'in-hand') return [{ kind: 'in-hand', id: null, name: 'In hand' }];
  if (placement.kind === 'location') return locationSegments(world, placement.locationId);
  const containers: PathSegment[] = [];
  let current: Placement = placement;
  for (let hops = 0; current.kind === 'container' && hops < MAX_HOPS; hops += 1) {
    const box = world.items.get(current.containerId);
    if (box === undefined) {
      return [
        { kind: 'missing', id: current.containerId, name: 'Unknown container' },
        ...containers,
      ];
    }
    containers.unshift({ kind: 'container', id: box.id, name: box.name });
    current = box.placement;
  }
  if (current.kind === 'location')
    return [...locationSegments(world, current.locationId), ...containers];
  if (current.kind === 'in-hand')
    return [{ kind: 'in-hand', id: null, name: 'In hand' }, ...containers];
  return containers;
}

/** The path of a remembered previous placement; a deleted place keeps only its name. */
export function previousTrail(world: PlacementWorld, previous: PreviousPlacement): PathSegment[] {
  if (previous.kind === 'deleted') return [{ kind: 'deleted', id: null, name: previous.name }];
  return placementTrail(world, previous);
}

/** The location an item ends up in once containers are followed. Null while in hand. */
export function effectiveLocationId(world: PlacementWorld, itemId: string): string | null {
  const item = world.items.get(itemId);
  if (item === undefined) return null;
  const last = placementTrail(world, item.placement)
    .filter((segment) => segment.kind === 'location')
    .at(-1);
  return last?.id ?? null;
}

/** Items placed directly inside a container, in name order. */
export function directContents(world: PlacementWorld, containerId: string): ItemRowModel[] {
  return [...world.items.values()]
    .filter(
      (item) => item.placement.kind === 'container' && item.placement.containerId === containerId
    )
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Everything under a container, following nested containers all the way down. */
export function deepContents(world: PlacementWorld, containerId: string): ItemRowModel[] {
  const seen = new Set<string>([containerId]);
  const out: ItemRowModel[] = [];
  const walk = (id: string): void => {
    for (const child of directContents(world, id)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
      if (child.container !== null) walk(child.id);
    }
  };
  walk(containerId);
  return out;
}

/** Whether `containerId` is `itemId` or sits anywhere inside it. */
export function isWithin(world: PlacementWorld, containerId: string, itemId: string): boolean {
  if (containerId === itemId) return true;
  return deepContents(world, itemId).some((inside) => inside.id === containerId);
}

/** Whether a location is `ancestorId` or one of its descendants. */
export function isLocationWithin(
  world: PlacementWorld,
  locationId: string,
  ancestorId: string
): boolean {
  return locationPath(world, locationId).some((node) => node.id === ancestorId);
}

/** Whether two placements name the same spot. */
export function samePlacement(a: Placement, b: PlacementTarget): boolean {
  if (a.kind === 'in-hand' || b.kind === 'in-hand') return a.kind === b.kind;
  if (a.kind === 'location' && b.kind === 'location') return a.locationId === b.locationId;
  if (a.kind === 'container' && b.kind === 'container') return a.containerId === b.containerId;
  return false;
}

/** The name a target is spoken of by, for button labels and toasts. */
export function targetName(world: PlacementWorld, target: PlacementTarget): string {
  if (target.kind === 'in-hand') return 'In hand';
  if (target.kind === 'location')
    return world.locations.get(target.locationId)?.name ?? 'Unknown place';
  return world.items.get(target.containerId)?.name ?? 'Unknown container';
}
