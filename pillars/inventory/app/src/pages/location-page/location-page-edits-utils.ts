import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { DeletePlaceState } from './location-page-parts.js';

function locationPathIncludes(world: PlacementWorld, id: string, ancestorId: string): boolean {
  const seen = new Set<string>();
  let current = world.locations.get(id);
  while (current !== undefined && current.parentId !== null && !seen.has(current.id)) {
    if (current.parentId === ancestorId) return true;
    seen.add(current.id);
    current = world.locations.get(current.parentId);
  }
  return false;
}

/** Builds the server confirmation summary from the currently loaded place world. */
export function deleteStateFor(
  world: PlacementWorld,
  tallyOf: (id: string) => PlaceTally,
  id: string
): DeletePlaceState | null {
  const place = world.locations.get(id);
  if (place === undefined) return null;
  const childCount = [...world.locations.values()].filter(
    (location) => location.parentId === id
  ).length;
  const descendantCount = [...world.locations.values()].filter(
    (location) => location.id !== id && locationPathIncludes(world, location.id, id)
  ).length;
  return {
    id,
    name: place.name,
    parentId: place.parentId,
    childCount,
    descendantCount,
    itemCount: tallyOf(id).total,
    requiresForce: false,
  };
}
