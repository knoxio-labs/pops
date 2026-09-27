import { effectiveLocationId, locationPath } from '../model/placement-model.js';

import type { PlacementWorld } from '../model/placement-model.js';

/** Returns the room above an item, or its in-hand or unknown-place label. */
export function roomOf(world: PlacementWorld, itemId: string): { id: string; name: string } {
  const locationId = effectiveLocationId(world, itemId);
  if (locationId === null) return { id: 'in-hand', name: 'In hand' };
  const path = locationPath(world, locationId);
  const room = path[1] ?? path[0];
  return room === undefined
    ? { id: 'unknown', name: 'Unknown place' }
    : { id: room.id, name: room.name };
}
