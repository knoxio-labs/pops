/**
 * The placement verbs a place's contents take, one row or a selection at
 * a time: pick up, take out of the box they are in (onto whatever the box
 * sits on), and move through the placement picker. Each lands at once with
 * Undo, through the same move plan a drop uses.
 */
import { useState } from 'react';

import { planMove, targetName } from '../foundation';
import { applyMove } from '../locations-tree/apply-move';

import type { PlacementTarget, PlacementWorld } from '../foundation';
import type { CommitWorld } from '../locations-tree/use-place-edits';

/** What {@link useItemActions} hands a list. */
export interface ItemActionsApi {
  /** Ids waiting for the picker to say where. Null while no move is open. */
  moving: readonly string[] | null;
  startMove: (ids: readonly string[]) => void;
  cancelMove: () => void;
  moveTo: (target: PlacementTarget) => void;
  pickUp: (ids: readonly string[]) => void;
  takeOut: (ids: readonly string[]) => void;
}

function things(count: number): string {
  return count === 1 ? '1 thing' : `${count} things`;
}

/** Where a thing lands when taken out of its box: wherever the box itself is. */
export function takeOutTarget(world: PlacementWorld, id: string): PlacementTarget | null {
  const entry = world.items.get(id);
  if (entry?.placement.kind !== 'container') return null;
  return world.items.get(entry.placement.containerId)?.placement ?? null;
}

/** Placement verbs over one world. */
export function useItemActions(
  world: PlacementWorld,
  commit: CommitWorld,
  seedMoving: readonly string[] | null = null
): ItemActionsApi {
  const [moving, setMoving] = useState(seedMoving);
  const move = (ids: readonly string[], target: PlacementTarget, verb: string) => {
    const plan = planMove({ world, selectedIds: ids, target });
    const count = plan.moving.length + plan.carried.length;
    commit(
      applyMove(world, plan),
      verb === 'Picked up' ? 'pickUp' : 'move',
      `${verb} ${things(count)}${verb === 'Picked up' ? '' : ` to ${targetName(world, target)}`}`
    );
  };
  const takeOut = (ids: readonly string[]) => {
    let next = world;
    for (const id of ids) {
      const target = takeOutTarget(next, id);
      if (target !== null)
        next = applyMove(next, planMove({ world: next, selectedIds: [id], target }));
    }
    commit(next, 'takeOut', `Took ${things(ids.length)} out`);
  };
  return {
    moving,
    startMove: (ids) => setMoving(ids),
    cancelMove: () => setMoving(null),
    moveTo: (target) => {
      if (moving !== null) move(moving, target, 'Moved');
      setMoving(null);
    },
    pickUp: (ids) => move(ids, { kind: 'in-hand' }, 'Picked up'),
    takeOut,
  };
}
