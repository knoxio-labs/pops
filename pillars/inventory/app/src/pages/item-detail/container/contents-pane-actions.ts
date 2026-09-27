import { useCallback } from 'react';

import { containerSelectionActions } from './contents-actions.js';
import { exitRefusal } from './unpack-model.js';

import type { SelectionBarAction } from '../../../foundation/model/contracts.js';
import type { SelectionApi } from '../../../foundation/selection/use-selection.js';
import type { ExitKind, UnpackState } from './unpack-model.js';

/** Builds bulk actions and clears the current selection before dispatching one. */
export function useContentsPaneActions({
  selection,
  state,
  name,
  readOnlyReason,
  onExit,
  onMove,
  onLabel,
  onLifecycle,
}: {
  selection: SelectionApi;
  state: UnpackState;
  name: string;
  readOnlyReason?: string;
  onExit: (ids: readonly string[], how: ExitKind) => void;
  onMove: (ids: readonly string[]) => void;
  onLabel: (ids: readonly string[]) => void;
  onLifecycle: (ids: readonly string[], lifecycle: 'retire' | 'discard') => void;
}): readonly SelectionBarAction[] {
  const ids = selection.selectedIds;
  const handleExit = useCallback(
    (how: ExitKind): void => {
      selection.clearSelection();
      onExit(ids, how);
    },
    [ids, onExit, selection]
  );
  const handleMove = useCallback((): void => {
    selection.clearSelection();
    onMove(ids);
  }, [ids, onMove, selection]);
  const handleLabel = useCallback((): void => {
    selection.clearSelection();
    onLabel(ids);
  }, [ids, onLabel, selection]);
  const handleLifecycle = useCallback(
    (lifecycle: 'retire' | 'discard'): void => {
      selection.clearSelection();
      onLifecycle(ids, lifecycle);
    },
    [ids, onLifecycle, selection]
  );
  return containerSelectionActions({
    ids,
    exitDisabledReason: exitRefusal(state, name) ?? undefined,
    readOnlyReason,
    onExit: handleExit,
    onMove: handleMove,
    onLabel: handleLabel,
    onLifecycle: handleLifecycle,
  });
}
