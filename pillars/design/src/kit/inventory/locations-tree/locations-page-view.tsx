import { AddRootLocationDialog } from './add-root-location-dialog';
import { DeleteDialog } from './delete-dialog';
import { MoveDialog } from './move-dialog';
import { SelectedLocationPanel } from './selected-location-panel';
import { TreeSection } from './tree-section';

import type {
  LocationsPageCallbacks,
  LocationsPageData,
  LocationsPagePending,
  LocationsPageSeed,
} from './locations-page-types';
import type { useLocationsPageState } from './use-locations-page-state';

type LocationsPageState = ReturnType<typeof useLocationsPageState>;

/** The tree and its contents panel, side by side: everything `LocationsPage` shows once the tree is non-empty. */
export function LocationsPageBody({
  state,
  data,
  seed,
  callbacks,
}: {
  state: LocationsPageState;
  data: LocationsPageData;
  seed: LocationsPageSeed;
  callbacks: LocationsPageCallbacks;
}) {
  return (
    <div className="flex flex-col md:flex-row gap-6">
      <TreeSection
        treeNodes={state.tree}
        isLoading={data.isLoading}
        selectedId={state.selection.selectedId}
        addingChildOf={state.selection.addingChildOf}
        overId={state.selection.overId}
        activeId={state.selection.activeId}
        activeNode={state.activeNode}
        onSelect={state.handlers.onSelect}
        onAddChild={state.handlers.onAddChild}
        onRename={state.handlers.onRename}
        onMoveStart={state.handlers.onMoveStart}
        onReorder={state.handlers.onReorder}
        onDelete={state.handlers.onDelete}
        onInsuranceReport={callbacks.onInsuranceReport}
        onNewChildSave={state.handlers.onNewChildSave}
        onNewChildCancel={state.handlers.onNewChildCancel}
        onDragStart={state.handlers.onDragStart}
        onDragOver={state.handlers.onDragOver}
        onDragEnd={state.handlers.onDragEnd}
        initialExpandedIds={seed.expandedIds}
        initialRenamingId={seed.renamingId}
      />
      <div className="md:w-3/5">
        <SelectedLocationPanel
          selectedId={state.selection.selectedId}
          nodeMap={state.nodeMap}
          directItems={state.directItems}
          subLocationItems={state.subLocationItems}
          onItemClick={callbacks.onItemOpen}
          onAddItem={callbacks.onAddItem}
        />
      </div>
    </div>
  );
}

/** The three dialogs `LocationsPage` can have open: add-root, move and delete-confirm. */
export function LocationsPageDialogs({
  state,
  pending,
}: {
  state: LocationsPageState;
  pending: LocationsPagePending;
}) {
  return (
    <>
      <AddRootLocationDialog
        open={state.selection.addingRoot}
        onOpenChange={state.selection.setAddingRoot}
        onSave={state.handlers.onNewRootSave}
        isPending={pending.create}
      />
      <MoveDialog
        movingId={state.selection.movingId}
        movingNode={state.movingNode}
        treeNodes={state.tree}
        nodeMap={state.nodeMap}
        onMoveTo={state.handlers.onMoveTo}
        onClose={state.handlers.onMoveClose}
      />
      <DeleteDialog
        deleteConfirm={state.deleteConfirm}
        onConfirm={state.handlers.onDeleteConfirm}
        onCancel={state.handlers.onDeleteCancel}
        isPending={pending.delete}
      />
    </>
  );
}
