/**
 * Applying a move plan to a local world, the way the server's move leaves
 * it: each moving item takes the target placement and remembers where it
 * was; what rides inside a moving box stays inside it. The review screens
 * use this so a drop or a Move visibly lands.
 */
import { buildWorld } from '../foundation';

import type { ItemRowModel, MovePlan, PlacementWorld, PreviousPlacement } from '../foundation';

function remembered(entry: ItemRowModel): PreviousPlacement | null {
  return entry.placement.kind === 'in-hand' ? entry.previous : entry.placement;
}

/** The world after `plan`. A refused plan, or one with nothing moving, changes nothing. */
export function applyMove(world: PlacementWorld, plan: MovePlan): PlacementWorld {
  if (plan.targetRefusal !== null || plan.moving.length === 0) return world;
  const moving = new Set(plan.moving.map((entry) => entry.id));
  const items = [...world.items.values()].map((entry) =>
    moving.has(entry.id) ? { ...entry, placement: plan.target, previous: remembered(entry) } : entry
  );
  return buildWorld(items, [...world.locations.values()]);
}
