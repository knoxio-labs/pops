import { NewItemButton } from '../../foundation/frame/new-item-button.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { ItemsSummary } from '../../foundation/list-page/items-summary.js';
import { ItemsToolbar } from '../../foundation/list-page/items-toolbar.js';
import { filterChips } from '../../foundation/list-page/list-filters.js';
import { SelectionDock } from '../../foundation/list-page/selection-dock.js';
import { useItemsExport, type ItemsExport } from '../../foundation/list-page/use-export.js';
import { useListPageKeys } from '../../foundation/list-page/use-list-page-keys.js';
import {
  useListVerbs,
  useTrackedWrites,
  type ListVerbs,
} from '../../foundation/list-page/use-list-verbs.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { itemsSearch } from '../../inventory-web/items-url-filters.js';
import { ExportMenu } from './export-menu.js';
import { ItemsBanner } from './items-banners.js';
import { ItemsListBody } from './items-cards.js';

import type { ReactElement } from 'react';

import type { ItemsPageModel } from './items-page-model.js';

function ItemsToolbarSection({ model }: { model: ItemsPageModel }): ReactElement | null {
  if (!model.showToolbar) return null;
  return (
    <div className="shrink-0 space-y-2">
      <ItemsToolbar
        filters={model.filters.filters}
        types={model.typeOptions}
        places={model.placeOptions}
        onFilters={model.filters.setFilters}
        onClear={model.filters.clearFilters}
        onView={(view) => model.filters.setFilters({ view })}
        scope="items"
      />
      <ItemsSummary
        shown={model.itemRows.total ?? 0}
        total={model.itemRows.unfilteredTotal ?? 0}
        hiddenInactive={model.itemRows.hiddenInactiveCount ?? 0}
        noun="items"
        chips={filterChips(
          model.filters.filters,
          model.typeOptions,
          model.placeOptions,
          model.filters.setFilters
        )}
        href={`/inventory/items${itemsSearch(model.filters.filters)}`}
      />
    </div>
  );
}

function ItemsPageActions({
  model,
  itemsExport,
}: {
  model: ItemsPageModel;
  itemsExport: ItemsExport;
}): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <ExportMenu
        viewCount={model.itemRows.total}
        selectedCount={model.selection.count}
        busy={itemsExport.busy}
        onView={() => void itemsExport.exportView(model.filters.queryFilters)}
        onSelection={() => void itemsExport.exportSelection(model.selection.selectedIds)}
        onTemplate={itemsExport.exportTemplate}
      />
      <NewItemButton offline={!model.online} onNavigate={model.navigate} />
    </div>
  );
}

function ItemsPageContent({ model, verbs }: { model: ItemsPageModel; verbs: ListVerbs }) {
  const { filters, itemRows } = model;
  return (
    <ItemsListBody
      itemRows={itemRows}
      filters={filters.filters}
      online={model.online}
      navigate={model.navigate}
      world={model.world}
      selection={model.selection}
      pendingIds={model.pendingIds}
      rejections={verbs.rejections}
      onRowVerb={verbs.onRowVerb}
      onSort={(sort) => filters.setFilters({ sort })}
      total={model.total}
      unfilteredTotal={model.unfilteredTotal}
      hiddenInactiveCount={model.hiddenInactiveCount}
      narrowed={model.narrowed}
      onClearFilters={model.clearEmptyFilters}
    />
  );
}

/** Renders the Items page around the server-backed model and its action hooks. */
export function ItemsPageView({ model }: { model: ItemsPageModel }): ReactElement {
  const { filters, itemRows, online, changed, duplicate } = model;
  const tracked = useTrackedWrites();
  const itemsExport = useItemsExport();
  const verbs = useListVerbs({
    rows: itemRows.rows,
    world: model.world,
    selection: model.selection,
    contentCounts: itemRows.contentCounts,
    offline: !online,
    tracked,
    extraHandlers: {
      export: () => void itemsExport.exportSelection(model.selection.selectedIds),
    },
  });
  useListPageKeys({ rows: itemRows.rows, selection: model.selection, extra: verbs.keyHandlers });

  return (
    <InventoryPage
      title="Items"
      icon={INVENTORY_ICONS.item}
      actions={<ItemsPageActions model={model} itemsExport={itemsExport} />}
      banner={
        <ItemsBanner
          online={online}
          changed={changed}
          duplicate={duplicate}
          onDismiss={model.dismissDuplicate}
          onCompare={(name) => filters.setFilters({ q: name })}
        />
      }
      toolbar={<ItemsToolbarSection model={model} />}
      dock={
        <SelectionDock
          selection={model.selection}
          loadedCount={itemRows.rows.length}
          carried={verbs.carried}
          actions={verbs.actions}
          offline={!online}
          anchorRef={verbs.dockAnchorRef}
        />
      }
      overlay={verbs.overlays}
    >
      <ItemsPageContent model={model} verbs={verbs} />
    </InventoryPage>
  );
}
