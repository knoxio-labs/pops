import { useCallback, useState } from 'react';

import { computeDeleteStats, requiresDeleteConfirmation } from './delete-stats';
import { computeArrowReorder } from './reorder';
import { applyLocationPatches, removeLocation } from './tree-mutations';

import type { DeleteConfirmState } from './delete-dialog';
import type { LocationsPageSeed } from './locations-page-types';
import type { useLocationSelectionState } from './use-location-selection';
import type { LocationTreeNode } from './utils';

interface Args {
  seed: LocationsPageSeed;
  setTree: (updater: (t: LocationTreeNode[]) => LocationTreeNode[]) => void;
  nodeMap: Map<string, LocationTreeNode>;
  itemCounts: Map<string, number>;
  selection: ReturnType<typeof useLocationSelectionState>;
}

/** Moving, deleting (with its confirmation dialog) and the arrow-key reorder. */
export function useLocationMoveDelete({ seed, setTree, nodeMap, itemCounts, selection }: Args) {
  const { movingId, setMovingId, setSelectedId } = selection;

  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(() => {
    if (!seed.deleteConfirmId) return null;
    const node = nodeMap.get(seed.deleteConfirmId);
    if (!node) return null;
    return { id: node.id, name: node.name, stats: computeDeleteStats(node, itemCounts) };
  });

  const handleMoveStart = useCallback((id: string) => setMovingId(id), [setMovingId]);

  const handleMoveTo = useCallback(
    (newParentId: string | null) => {
      if (!movingId) return;
      // Same defect as the drag-drop reparent branch (POPS-3603): the app's
      // `handleMoveTo` also sends only `{ parentId }`, no `sortOrder`.
      setTree((t) => applyLocationPatches(t, [{ id: movingId, parentId: newParentId }]));
      setMovingId(null);
    },
    [movingId, setTree, setMovingId]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const node = nodeMap.get(id);
      if (!node) return;
      const stats = computeDeleteStats(node, itemCounts);
      if (requiresDeleteConfirmation(stats)) {
        setDeleteConfirm({ id, name: node.name, stats });
        return;
      }
      setTree((t) => removeLocation(t, id));
      setSelectedId((prev) => (prev === id ? null : prev));
    },
    [nodeMap, itemCounts, setTree, setSelectedId]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteConfirm) return;
    setTree((t) => removeLocation(t, deleteConfirm.id));
    setSelectedId((prev) => (prev === deleteConfirm.id ? null : prev));
    setDeleteConfirm(null);
  }, [deleteConfirm, setTree, setSelectedId]);

  const handleReorder = useCallback(
    (id: string, direction: 'up' | 'down') => {
      setTree((t) => applyLocationPatches(t, computeArrowReorder(id, direction, nodeMap, t)));
    },
    [nodeMap, setTree]
  );

  return {
    deleteConfirm,
    setDeleteConfirm,
    handleMoveStart,
    handleMoveTo,
    handleDelete,
    handleDeleteConfirm,
    handleReorder,
  };
}
