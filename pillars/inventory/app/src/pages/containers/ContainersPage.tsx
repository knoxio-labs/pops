import { useCallback } from 'react';

import { showUndoToast } from '../../foundation/feedback/undo-toast.js';
import { NewItemButton } from '../../foundation/frame/new-item-button.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { SelectionDock } from '../../foundation/list-page/selection-dock.js';
import { useItemsExport } from '../../foundation/list-page/use-export.js';
import { useListPageKeys } from '../../foundation/list-page/use-list-page-keys.js';
import { useListVerbs, useTrackedWrites } from '../../foundation/list-page/use-list-verbs.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import { containerActions } from './container-actions.js';
import { ContainersBody } from './containers-list.js';
import { containerTypeKey } from './containers-model.js';
import { useContainersPageSources } from './containers-page-model.js';
import { ContainersBanner, ContainersToolbar } from './containers-toolbar.js';

import type { ReactElement } from 'react';

import type { TrackedWrites } from '../../foundation/list-page/use-list-verbs.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { useBulkItemVerbs as useBulkItemVerbsType } from '../../inventory-web/item-verbs-bulk.js';

async function runContainerAccess(input: {
  ids: readonly string[];
  access: 'open' | 'closed';
  world: PlacementWorld;
  bulk: ReturnType<typeof useBulkItemVerbsType>;
  tracked: TrackedWrites;
}): Promise<void> {
  if (input.ids.length === 0) return;
  try {
    const result = await input.tracked.track(input.ids, () =>
      input.bulk.setAccess(input.ids, input.access)
    );
    if (result.applied.length === 0 || result.undo === null) return;
    const verb = input.access === 'open' ? 'Opened' : 'Closed';
    const first = input.world.items.get(result.applied[0] ?? '');
    const message =
      result.applied.length === 1
        ? `${verb} ${first?.name ?? 'container'}`
        : `${verb} ${result.applied.length} containers`;
    showUndoToast({
      concept: input.access,
      message,
      onUndo: result.undo,
    });
  } catch {
    for (const id of input.ids)
      input.tracked.setRejection(id, 'The inventory service did not answer.');
  }
}

function containerNewPath(
  types: ReturnType<typeof useContainersPageSources>['typeOptions']
): string {
  const key = containerTypeKey(types);
  return key === null
    ? '/inventory/items/new'
    : `/inventory/items/new?type=${encodeURIComponent(key)}`;
}

function useContainersPageView(model: ReturnType<typeof useContainersPageSources>) {
  const tracked = useTrackedWrites();
  const bulk = useBulkItemVerbs();
  const itemsExport = useItemsExport();
  const verbs = useListVerbs({
    rows: model.itemRows.rows,
    webItems: model.itemRows.webItems,
    catalogue: model.catalogue.catalogue,
    world: model.world,
    selection: model.selection,
    contentCounts: model.itemRows.contentCounts,
    offline: !model.online,
    tracked,
    extraHandlers: {
      export: () => void itemsExport.exportSelection(model.selection.selectedIds),
    },
  });
  useListPageKeys({
    rows: model.itemRows.rows,
    selection: model.selection,
    extra: verbs.keyHandlers,
    trail: { listName: 'Containers' },
  });
  const onAccess = useCallback(
    (access: 'open' | 'closed'): void => {
      void runContainerAccess({
        ids: model.selection.selectedIds,
        access,
        world: model.world,
        bulk,
        tracked,
      });
    },
    [bulk, model.selection.selectedIds, model.world, tracked]
  );
  const actions = containerActions(
    model.world,
    model.selection.selectedIds,
    verbs.actions,
    onAccess
  );
  return { verbs, actions };
}

/** Renders the server-backed Containers browser and its state segments. */
export function ContainersPage(): ReactElement {
  const model = useContainersPageSources();
  const view = useContainersPageView(model);
  return (
    <InventoryPage
      title="Containers"
      icon={INVENTORY_ICONS.container}
      actions={
        <NewItemButton
          label="New container"
          offline={!model.online}
          newPath={containerNewPath(model.typeOptions)}
          onNavigate={model.navigate}
        />
      }
      banner={<ContainersBanner model={model} />}
      toolbar={<ContainersToolbar model={model} />}
      dock={
        <SelectionDock
          selection={model.selection}
          loadedCount={model.itemRows.rows.length}
          carried={view.verbs.carried}
          actions={view.actions}
          offline={!model.online}
          anchorRef={view.verbs.dockAnchorRef}
        />
      }
      overlay={view.verbs.overlays}
    >
      <ContainersBody
        model={model}
        rejections={view.verbs.rejections}
        onRowVerb={view.verbs.onRowVerb}
      />
    </InventoryPage>
  );
}
