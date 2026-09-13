import { computeLocationsPageDerived } from './locations-page-derived';
import { useLocationCrud } from './use-location-crud';
import { useLocationDrag } from './use-location-drag';
import { useLocationMoveDelete } from './use-location-move-delete';
import { useLocationSelectionState } from './use-location-selection';
import { useLocationTreeData } from './use-location-tree-data';

import type { LocationsPageData, LocationsPageSeed } from './locations-page-types';

export interface LocationsPageStateInput {
  data: LocationsPageData;
  seed: LocationsPageSeed;
}

/**
 * All local state, derived values and handlers behind `LocationsPage`,
 * composed from the smaller hooks in this directory so no single function
 * accumulates every branch: the tree itself, the drag-and-drop reorder, and
 * the mutations that would otherwise be round trips (see `tree-mutations.ts`).
 */
export function useLocationsPageState({ data, seed }: LocationsPageStateInput) {
  const { tree, setTree, nodeMap, itemCounts } = useLocationTreeData(data);
  const selection = useLocationSelectionState(seed);
  const crud = useLocationCrud({ setTree, selection });
  const moveDelete = useLocationMoveDelete({ seed, setTree, nodeMap, itemCounts, selection });
  const drag = useLocationDrag({ tree, setTree, nodeMap, selection });
  const derived = computeLocationsPageDerived({ data, tree, nodeMap, selection });

  return {
    tree,
    nodeMap,
    selection,
    ...derived,
    deleteConfirm: moveDelete.deleteConfirm,
    handlers: {
      onSelect: selection.toggleSelected,
      onAddChild: crud.handleAddChild,
      onAddRootClick: crud.handleAddRootClick,
      onNewRootSave: crud.handleNewRootSave,
      onNewChildSave: crud.handleNewChildSave,
      onNewChildCancel: crud.handleNewChildCancel,
      onRename: crud.handleRename,
      onMoveStart: moveDelete.handleMoveStart,
      onMoveTo: moveDelete.handleMoveTo,
      onDelete: moveDelete.handleDelete,
      onDeleteConfirm: moveDelete.handleDeleteConfirm,
      onDeleteCancel: () => moveDelete.setDeleteConfirm(null),
      onReorder: moveDelete.handleReorder,
      onDragStart: drag.handleDragStart,
      onDragOver: drag.handleDragOver,
      onDragEnd: drag.handleDragEnd,
      onMoveClose: () => selection.setMovingId(null),
    },
  };
}
