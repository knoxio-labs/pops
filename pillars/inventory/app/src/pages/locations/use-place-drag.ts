import { useCallback, useMemo, useState } from 'react';

import { dropPlaceVerdict } from '../../foundation/places/tree-model.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { DropPosition, PlaceVerdict } from '../../foundation/places/tree-model.js';

/** The place and row-relative position currently held by a tree drag. */
export interface PlaceDragState {
  placeId: string;
  targetId: string | null;
  position: DropPosition;
}

/** The state machine used by the Locations tree's place drag. */
export interface PlaceDragApi {
  state: PlaceDragState | null;
  begin: (placeId: string) => void;
  hover: (targetId: string, position: DropPosition) => void;
  verdict: () => PlaceVerdict | null;
  drop: () => void;
  cancel: () => void;
}

/** Converts a pointer offset into before, inside, or after row placement. */
export function positionFromPointer(offsetY: number, height: number): DropPosition {
  if (height <= 0) return 'inside';
  const ratio = offsetY / height;
  if (ratio < 0.25) return 'before';
  return ratio > 0.75 ? 'after' : 'inside';
}

/** Coordinates a place drag against the shared tree placement rules. */
export function usePlaceDrag(
  world: PlacementWorld,
  onDrop: (placeId: string, targetId: string, position: DropPosition) => void
): PlaceDragApi {
  const [state, setState] = useState<PlaceDragState | null>(null);
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
        if (answer?.ok === true && state?.targetId !== null && state?.targetId !== undefined) {
          onDrop(state.placeId, state.targetId, state.position);
        }
        setState(null);
      },
      cancel,
    }),
    [cancel, onDrop, state, verdict]
  );
}
