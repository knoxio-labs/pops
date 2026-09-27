import { useCallback, useState } from 'react';

import { usePlaceEdits } from '../location-page/location-page-edits.js';

import type { buildWorld } from '../../foundation/model/placement-model.js';
import type { LocationEdits } from './location-tree.js';

/** Coordinates create, rename, move, and delete controls for the Locations page. */
export function useLocationsEdits({
  online,
  world,
  tallyOf,
  onDeleted,
}: {
  online: boolean;
  world: ReturnType<typeof buildWorld>;
  tallyOf: Parameters<typeof usePlaceEdits>[0]['tallyOf'];
  onDeleted: (parentId: string | null) => void;
}): LocationEdits {
  const base = usePlaceEdits({ online, world, tallyOf, onDeleted });
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined);
  const startCreate = useCallback(
    (parentId: string | null): void => {
      if (!online) return;
      setCreatingUnder(parentId);
      if (parentId === null) base.startCreate();
      else base.startCreate(parentId);
    },
    [base, online]
  );
  const commitCreate = useCallback(
    (name: string): void => {
      base.commitCreate(name);
      if (name.trim() !== '') setCreatingUnder(undefined);
    },
    [base]
  );
  const cancelCreate = useCallback((): void => {
    setCreatingUnder(undefined);
    base.cancelCreate();
  }, [base]);
  const startRename = useCallback(
    (id: string | null): void => {
      if (id !== null && !online) return;
      base.startRename(id);
    },
    [base, online]
  );
  return {
    creatingUnder,
    renamingId: base.renamingId,
    deleting: base.deleting,
    pendingDelete: base.pendingDelete,
    error: base.error,
    startCreate,
    commitCreate,
    cancelCreate,
    startRename,
    commitRename: base.commitRename,
    moveTo: base.moveTo,
    arrange: base.arrange,
    setDeleteMode: base.setDeleteMode,
    confirmDeletePlan: base.confirmDeletePlan,
    requestDelete: base.requestDelete,
    confirmDelete: base.confirmDelete,
    cancelDelete: base.cancelDelete,
  };
}
