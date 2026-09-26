/**
 * The foundation's fictional inventory: types, the location tree, 46 named
 * items and containers, and the world snapshot the placement model answers
 * against. Every unit's screens draw from this one population.
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

/** Every named item and container. */
export const coreInventory: readonly ItemRowModel[] = [...coreContainers, ...coreItems];

/** The snapshot every foundation state reads placements from. */
export const coreWorld: PlacementWorld = buildWorld(coreInventory, coreLocations);

/** A named item by id; throws so a typo in a screen fails loudly in the render smoke test. */
export function coreItem(id: string): ItemRowModel {
  const found = coreWorld.items.get(id);
  if (found === undefined) throw new Error(`No core inventory item ${id}`);
  return found;
}

/** Items currently in hand. */
export const inHandItems: readonly ItemRowModel[] = coreInventory.filter(
  (entry) => entry.placement.kind === 'in-hand'
);

/** Active containers that are open, which the picker offers first. */
export const openContainers: readonly ItemRowModel[] = coreContainers.filter(
  (entry) => entry.container?.access === 'open' && entry.lifecycle === 'active'
);
