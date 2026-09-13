import { useCallback } from 'react';

import { addLocation, renameLocation } from './tree-mutations';

import type { useLocationSelectionState } from './use-location-selection';
import type { LocationTreeNode } from './utils';

interface Args {
  setTree: (updater: (t: LocationTreeNode[]) => LocationTreeNode[]) => void;
  selection: ReturnType<typeof useLocationSelectionState>;
}

/** Adding a root or child location, cancelling that, and renaming an existing node. */
export function useLocationCrud({ setTree, selection }: Args) {
  const { addingChildOf, setAddingChildOf, setAddingRoot } = selection;

  const handleAddChild = useCallback(
    (parentId: string) => {
      setAddingChildOf(parentId);
      setAddingRoot(false);
    },
    [setAddingChildOf, setAddingRoot]
  );

  const handleAddRootClick = useCallback(() => {
    setAddingRoot(true);
    setAddingChildOf(null);
  }, [setAddingRoot, setAddingChildOf]);

  const handleNewRootSave = useCallback(
    (name: string) => {
      setTree((t) => addLocation(t, { name, parentId: null }));
      setAddingRoot(false);
    },
    [setTree, setAddingRoot]
  );

  const handleNewChildSave = useCallback(
    (name: string) => {
      if (!addingChildOf) return;
      setTree((t) => addLocation(t, { name, parentId: addingChildOf }));
      setAddingChildOf(null);
    },
    [addingChildOf, setTree, setAddingChildOf]
  );

  const handleNewChildCancel = useCallback(() => setAddingChildOf(null), [setAddingChildOf]);

  const handleRename = useCallback(
    (id: string, newName: string) => {
      setTree((t) => renameLocation(t, id, newName));
    },
    [setTree]
  );

  return {
    handleAddChild,
    handleAddRootClick,
    handleNewRootSave,
    handleNewChildSave,
    handleNewChildCancel,
    handleRename,
  };
}
