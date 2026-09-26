/**
 * The fictional inventory snapshot shared by foundation tests and stories.
 * It contains all named items, containers, locations, and their placement world.
 */
import { buildWorld } from '../model/placement-model';
import { coreContainers } from './core-containers';
import { coreItems } from './core-items';
import { coreLocations } from './core-locations';

import type { ItemRowModel } from '../model/model';
import type { PlacementWorld } from '../model/placement-model';

export * from './core-containers';
export * from './core-factory';
export * from './core-items';
export { coreLocations } from './core-locations';
export * from './core-types';

/** Every named item and container in the foundation snapshot. */
export const coreInventory: readonly ItemRowModel[] = [...coreContainers, ...coreItems];

/** The placement snapshot used by foundation model tests and stories. */
export const coreWorld: PlacementWorld = buildWorld(coreInventory, coreLocations);

/** Returns a named fixture item and throws when the ID is not present. */
export function coreItem(id: string): ItemRowModel {
  const found = coreWorld.items.get(id);
  if (found === undefined) throw new Error('No core inventory item ' + id);
  return found;
}

/** Items currently carried in hand. */
export const inHandItems: readonly ItemRowModel[] = coreInventory.filter(
  (entry) => entry.placement.kind === 'in-hand'
);

/** Active open containers offered first by placement pickers. */
export const openContainers: readonly ItemRowModel[] = coreContainers.filter(
  (entry) => entry.container?.access === 'open' && entry.lifecycle === 'active'
);
