import { useCallback, useMemo, useState } from 'react';

import { planMove } from '../../../foundation/move-plan/move-plan-model.js';

import type { PlacementTarget } from '../../../foundation/model/model.js';
import type { PlacementWorld } from '../../../foundation/model/placement-model.js';
import type { MovePlan } from '../../../foundation/move-plan/move-plan-model.js';
import type { UnpackState } from './unpack-model.js';

/** The picker and move-plan state owned by a container workspace. */
export interface ContainerPlacementState {
  pickerOpen: boolean;
  moveIds: readonly string[];
  moveTarget: PlacementTarget | null;
  movePlan: MovePlan | null;
  openMove: (ids: readonly string[]) => void;
  onPickerOpenChange: (open: boolean) => void;
  setPickerOpen: (open: boolean) => void;
  setMoveTarget: (target: PlacementTarget | null) => void;
  clearMove: () => void;
}

/** Creates placement-picker state while refusing closed, empty, and read-only moves. */
export function useContainerPlacement({
  state,
  world,
  readOnly,
}: {
  state: UnpackState;
  world: PlacementWorld;
  readOnly: boolean;
}): ContainerPlacementState {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moveIds, setMoveIds] = useState<readonly string[]>([]);
  const [moveTarget, setMoveTarget] = useState<PlacementTarget | null>(null);
  const movePlan = useMemo(
    () =>
      moveTarget === null ? null : planMove({ world, selectedIds: moveIds, target: moveTarget }),
    [moveIds, moveTarget, world]
  );
  const openMove = useCallback(
    (ids: readonly string[]): void => {
      const selected = [...new Set(ids)].filter((id) => state.inside.includes(id));
      if (readOnly || selected.length === 0 || state.access === 'closed') return;
      setMoveIds(selected);
      setMoveTarget(null);
      setPickerOpen(true);
    },
    [readOnly, state]
  );
  const onPickerOpenChange = useCallback(
    (open: boolean): void => {
      setPickerOpen(open);
      if (!open && moveTarget === null) setMoveIds([]);
    },
    [moveTarget]
  );
  const clearMove = useCallback((): void => {
    setMoveTarget(null);
    setMoveIds([]);
  }, []);
  return {
    pickerOpen,
    moveIds,
    moveTarget,
    movePlan,
    openMove,
    onPickerOpenChange,
    setPickerOpen,
    setMoveTarget,
    clearMove,
  };
}
