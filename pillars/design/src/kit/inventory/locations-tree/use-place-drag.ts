/**
 * Dragging a place within the tree: which place is held, which row it is
 * over, and whether it would land before, after or inside that row. The
 * verdict comes from the tree model, so a drop can never do something the
 * Move picker would refuse.
 */
import { useCallback, useMemo, useState } from 'react';

import { dropPlaceVerdict } from './tree-model';

import type { PlacementWorld } from '../foundation';
import type { DropPosition, PlaceVerdict } from './tree-model';

/** A place mid-drag. `targetId` is null until it is over a row. */
export interface PlaceDragState {
  placeId: string;
  targetId: string | null;
  position: DropPosition;
}

/** What {@link usePlaceDrag} hands the tree. */
export interface PlaceDragApi {
  state: PlaceDragState | null;
  begin: (placeId: string) => void;
  hover: (targetId: string, position: DropPosition) => void;
  verdict: () => PlaceVerdict | null;
  /** Applies the drop through `onDrop` when allowed; always ends the drag. */
  drop: () => void;
  cancel: () => void;
}

/** Where on a row the pointer is: the top quarter is before, the bottom quarter after. */
export function positionFromPointer(offsetY: number, height: number): DropPosition {
  if (height <= 0) return 'inside';
  const ratio = offsetY / height;
  if (ratio < 0.25) return 'before';
  return ratio > 0.75 ? 'after' : 'inside';
}

/** Place drag state for one tree. */
export function usePlaceDrag(
  world: PlacementWorld,
  onDrop: (placeId: string, targetId: string, position: DropPosition) => void,
  seed: PlaceDragState | null = null
): PlaceDragApi {
  const [state, setState] = useState(seed);
  const verdict = useCallback((): PlaceVerdict | null => {
    if (state === null || state.targetId === null) return null;
    return dropPlaceVerdict(world, state.placeId, state.targetId, state.position);
  }, [state, world]);
  const cancel = useCallback(() => setState(null), []);
  return useMemo(
    () => ({
      state,
      begin: (placeId) => setState({ placeId, targetId: null, position: 'inside' }),
      hover: (targetId, position) =>
        setState((current) => (current === null ? null : { ...current, targetId, position })),
      verdict,
      drop: () => {
        const answer = verdict();
        if (answer?.ok === true && state?.targetId) {
          onDrop(state.placeId, state.targetId, state.position);
        }
        setState(null);
      },
      cancel,
    }),
    [state, verdict, cancel, onDrop]
  );
}
