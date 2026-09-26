/**
 * Drag and drop placement as state, independent of the drag library: what
 * is being dragged, which target is under it, and that target's verdict.
 * Verdicts come from the move plan, so a drop can never do something the
 * Move button would refuse. Every drop has a keyboard twin: Move via the
 * placement picker.
 */
import { useCallback, useMemo, useState } from 'react';

import { samePlacement } from '../model/placement-model';
import { dropVerdict } from '../move-plan/move-plan-model';

import type { PlacementTarget } from '../model/model';
import type { PlacementWorld } from '../model/placement-model';
import type { DropVerdict } from '../move-plan/move-plan-model';

/** How a target should draw while something is dragged over or near it. */
export type DropTargetState = 'idle' | 'available' | 'over' | 'refused';

/** The controls and verdicts exposed for one list using drag placement. */
export interface DragPlacementApi {
  /** Ids being dragged: the selection when a selected row is dragged, else that row. */
  dragging: readonly string[];
  /** The target currently under the dragged item, if any. */
  over: PlacementTarget | null;
  /** Starts a drag for the row, carrying the whole selection when applicable. */
  begin: (rowId: string, selectedIds: readonly string[]) => void;
  /** Records the target currently under the dragged item. */
  hover: (target: PlacementTarget | null) => void;
  /** Computes the shared move-plan verdict for a target. */
  verdictFor: (target: PlacementTarget) => DropVerdict;
  /** Converts a target verdict into the state used by its visual affordance. */
  stateFor: (target: PlacementTarget) => DropTargetState;
  /** Applies the drop when the verdict allows it; returns the verdict either way. */
  drop: (target: PlacementTarget) => DropVerdict;
  /** Ends the drag without applying a placement. */
  cancel: () => void;
}

/** The ids a drag carries: the whole selection if the grabbed row is in it. */
export function dragSet(rowId: string, selectedIds: readonly string[]): string[] {
  return selectedIds.includes(rowId) ? [...selectedIds] : [rowId];
}

/** Drag state for one list over one world. `onDrop` runs only for an accepted drop. */
export function useDragPlacement(
  world: PlacementWorld,
  onDrop: (ids: readonly string[], target: PlacementTarget) => void
): DragPlacementApi {
  const [dragging, setDragging] = useState<readonly string[]>([]);
  const [over, setOver] = useState<PlacementTarget | null>(null);
  const verdictFor = useCallback(
    (target: PlacementTarget) => dropVerdict(world, dragging, target),
    [world, dragging]
  );
  const cancel = useCallback(() => {
    setDragging([]);
    setOver(null);
  }, []);
  return useMemo(
    () => ({
      dragging,
      over,
      begin: (rowId, selectedIds) => setDragging(dragSet(rowId, selectedIds)),
      hover: setOver,
      verdictFor,
      stateFor: (target) => {
        if (dragging.length === 0) return 'idle';
        if (!verdictFor(target).ok) return 'refused';
        return over !== null && samePlacement(over, target) ? 'over' : 'available';
      },
      drop: (target) => {
        const verdict = verdictFor(target);
        if (verdict.ok) onDrop(dragging, target);
        cancel();
        return verdict;
      },
      cancel,
    }),
    [dragging, over, verdictFor, onDrop, cancel]
  );
}
