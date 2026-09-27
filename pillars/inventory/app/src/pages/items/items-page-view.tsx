import { useCallback } from 'react';
import { useLocation } from 'react-router';

import { NewItemButton } from '../../foundation/frame/new-item-button.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { ItemsSummary } from '../../foundation/list-page/items-summary.js';
import { ItemsToolbar } from '../../foundation/list-page/items-toolbar.js';
import { filterChips } from '../../foundation/list-page/list-filters.js';
import { SelectionDock } from '../../foundation/list-page/selection-dock.js';
import { useListPageKeys } from '../../foundation/list-page/use-list-page-keys.js';
import { useListVerbs, useTrackedWrites } from '../../foundation/list-page/use-list-verbs.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { itemsSearch } from '../../inventory-web/items-url-filters.js';
import { listTrailState } from '../../inventory-web/list-trail.js';
import { ItemsBanner } from './items-banners.js';
import { ItemsListBody } from './items-cards.js';

import type { ReactElement } from 'react';

import type { ItemsPageModel } from './items-page.js';

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

function useItemsPageView(model: ItemsPageModel) {
  const location = useLocation();
  const { itemRows, navigate } = model;
  const tracked = useTrackedWrites();
  const verbs = useListVerbs({
    rows: itemRows.rows,
    world: model.world,
    selection: model.selection,
    contentCounts: model.itemRows.contentCounts,
    offline: !model.online,
    tracked,
  });
  useListPageKeys({
    rows: model.itemRows.rows,
    selection: model.selection,
    extra: verbs.keyHandlers,
    trail: { listName: 'Items' },
  });
  const openItem = useCallback(
    (id: string): void => {
      void navigate(`/inventory/items/${id}`, {
        state: listTrailState({
          listName: 'Items',
          href: `${location.pathname}${location.search}`,
          ids: itemRows.rows.map((row) => row.id),
        }),
      });
    },
    [itemRows.rows, location.pathname, location.search, navigate]
  );
  return { verbs, openItem };
}

/** Renders the server-backed Items page using the prepared page model. */
export function ItemsPageView({ model }: { model: ItemsPageModel }): ReactElement {
  const view = useItemsPageView(model);
  return (
    <InventoryPage
      title="Items"
      icon={INVENTORY_ICONS.item}
      actions={<NewItemButton offline={!model.online} onNavigate={model.navigate} />}
      banner={
        <ItemsBanner
          online={model.online}
          changed={model.changed}
          duplicate={model.duplicate}
          onDismiss={model.dismissDuplicate}
          onCompare={(name) => model.filters.setFilters({ q: name })}
        />
      }
      toolbar={<ItemsToolbarSection model={model} />}
      dock={
        <SelectionDock
          selection={model.selection}
          loadedCount={model.itemRows.rows.length}
          carried={view.verbs.carried}
          actions={view.verbs.actions}
          offline={!model.online}
          anchorRef={view.verbs.dockAnchorRef}
        />
      }
      overlay={view.verbs.overlays}
    >
      <ItemsListBody
        itemRows={model.itemRows}
        filters={model.filters.filters}
        online={model.online}
        navigate={model.navigate}
        world={model.world}
        selection={model.selection}
        pendingIds={model.pendingIds}
        rejections={view.verbs.rejections}
        onRowVerb={view.verbs.onRowVerb}
        onSort={(sort) => model.filters.setFilters({ sort })}
        total={model.total}
        unfilteredTotal={model.unfilteredTotal}
        hiddenInactiveCount={model.hiddenInactiveCount}
        narrowed={model.narrowed}
        onClearFilters={model.clearEmptyFilters}
        onOpen={view.openItem}
      />
    </InventoryPage>
  );
}
