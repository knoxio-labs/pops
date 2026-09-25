/**
 * U0's drag placement, with one addition the review states need: it can
 * open frozen mid-drag (rows grabbed, a target under the pointer) and hands
 * over to the live hook the moment anything real happens.
 */
import { useMemo, useState } from 'react';

import { dropVerdict, samePlacement, useDragPlacement } from '../foundation';

import type { DragPlacementApi, PlacementTarget, PlacementWorld } from '../foundation';

/** A drag frozen for review: what is grabbed and what it hovers. */
export interface ItemDragSeed {
  ids: readonly string[];
  over: PlacementTarget | null;
}

function frozen(
  world: PlacementWorld,
  seed: ItemDragSeed,
  live: DragPlacementApi,
  release: () => void
): DragPlacementApi {
  const verdictFor = (target: PlacementTarget) => dropVerdict(world, seed.ids, target);
  return {
    dragging: seed.ids,
    over: seed.over,
    verdictFor,
    stateFor: (target) => {
      if (!verdictFor(target).ok) return 'refused';
      return seed.over !== null && samePlacement(seed.over, target) ? 'over' : 'available';
    },
    begin: (rowId, selected) => {
      release();
      live.begin(rowId, selected);
    },
    hover: live.hover,
    drop: (target) => {
      release();
      return verdictFor(target);
    },
    cancel: release,
  };
}

/** Drag placement for one list, optionally opening frozen at `seed`. */
export function useItemDrag(
  world: PlacementWorld,
  onDrop: (ids: readonly string[], target: PlacementTarget) => void,
  seed: ItemDragSeed | null = null
): DragPlacementApi {
  const live = useDragPlacement(world, onDrop);
  const [held, setHeld] = useState(seed);
  return useMemo(
    () => (held === null ? live : frozen(world, held, live, () => setHeld(null))),
    [held, live, world]
  );
}
