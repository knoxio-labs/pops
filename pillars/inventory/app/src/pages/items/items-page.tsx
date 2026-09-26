import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { Button, PageHeader } from '@pops/ui';

import { ItemsSummary } from '../../foundation/list-page/items-summary.js';
import { ItemsToolbar } from '../../foundation/list-page/items-toolbar.js';
import {
  filterChips,
  isNarrowed,
  placeFilterOptions,
  typeFilterOptions,
} from '../../foundation/list-page/list-filters.js';
import { useListPageKeys } from '../../foundation/list-page/use-list-page-keys.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { buildWorld } from '../../foundation/model/placement-model.js';
import { useSelection } from '../../foundation/selection/use-selection.js';
import { usePendingItemIds } from '../../inventory-web/item-verbs.js';
import { itemsQuery, itemsSearch } from '../../inventory-web/items-url-filters.js';
import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import { useItemsUrlFilters } from '../../inventory-web/useItemsUrlFilters.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useItemRows } from '../../inventory-web/useWebItems.js';
import { ItemsBanner, findDuplicatePair } from './items-banners.js';
import { ItemsBody } from './items-body.js';

import type { ReactElement } from 'react';

function NewItemButton({
  offline,
  onNavigate,
}: {
  offline: boolean;
  onNavigate: (path: string) => void;
}): ReactElement {
  return (
    <Button
      disabled={offline}
      onClick={() => onNavigate('/inventory/items/new')}
      prefix={<Plus className="size-4" aria-hidden />}
    >
      New item
    </Button>
  );
}

function useItemsPageSources() {
  const navigate = useNavigate();
  const filters = useItemsUrlFilters();
  const itemRows = useItemRows(itemsQuery(filters.queryFilters), 50);
  const online = useOnline();
  const catalogue = useCatalogueLookups();
  const placementSubject = useMemo(() => ({ kind: 'items' as const, ids: [] as const }), []);
  const placement = usePlacementSources(placementSubject);
  const pendingIds = usePendingItemIds();
  const selection = useSelection(itemRows.rows.map((row) => row.id));
  const changed = useChangedElsewhere({
    queryKeys: [[...WEB_ITEMS_QUERY_KEY, 'list']],
    enabled: itemRows.status === 'success',
  });
  useListPageKeys({ rows: itemRows.rows, selection });
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false);

  return {
    navigate,
    filters,
    itemRows,
    online,
    placement,
    catalogue,
    pendingIds,
    selection,
    changed,
    dismissedDuplicate,
    dismissDuplicate: () => setDismissedDuplicate(true),
  };
}

function useItemsPageDerived(sources: ReturnType<typeof useItemsPageSources>) {
  const { itemRows, placement, catalogue, filters, dismissedDuplicate } = sources;

  const world = useMemo(
    () =>
      buildWorld(
        [...placement.world.items.values(), ...itemRows.rows],
        [...placement.world.locations.values()]
      ),
    [itemRows.rows, placement.world]
  );
  const typeOptions = useMemo(() => typeFilterOptions(catalogue.types), [catalogue.types]);
  const activeContainers = useMemo(
    () => [...world.items.values()].filter((item) => item.container !== null),
    [world]
  );
  const placeOptions = useMemo(
    () => placeFilterOptions([...world.locations.values()], activeContainers),
    [activeContainers, world.locations]
  );
  const duplicate =
    itemRows.status === 'success' && !dismissedDuplicate
      ? findDuplicatePair(itemRows.rows, world)
      : null;
  const total = itemRows.total ?? 0;
  const unfilteredTotal = itemRows.unfilteredTotal ?? 0;
  const hiddenInactiveCount = itemRows.hiddenInactiveCount ?? 0;
  const narrowed = isNarrowed(filters.filters);
  const showToolbar =
    itemRows.status === 'success' && (unfilteredTotal > 0 || hiddenInactiveCount > 0 || narrowed);
  const clearEmptyFilters = (): void => {
    filters.setFilters({ q: '', typeKey: null, untyped: false, inactive: false, within: null });
  };

  return {
    world,
    typeOptions,
    placeOptions,
    duplicate,
    total,
    unfilteredTotal,
    hiddenInactiveCount,
    narrowed,
    showToolbar,
    clearEmptyFilters,
  };
}

function useItemsPageModel() {
  const sources = useItemsPageSources();
  return { ...sources, ...useItemsPageDerived(sources) };
}

type ItemsPageModel = ReturnType<typeof useItemsPageModel>;

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

function ItemsPageView({ model }: { model: ItemsPageModel }): ReactElement {
  const { filters, itemRows, online, navigate, changed, duplicate } = model;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <PageHeader
        title="Items"
        icon={<INVENTORY_ICONS.item className="size-6 text-muted-foreground" aria-hidden />}
        actions={<NewItemButton offline={!online} onNavigate={navigate} />}
      />
      <ItemsBanner
        online={online}
        changed={changed}
        duplicate={duplicate}
        onDismiss={model.dismissDuplicate}
        onCompare={(name) => filters.setFilters({ q: name })}
      />
      <ItemsToolbarSection model={model} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ItemsBody
          status={itemRows.status}
          rows={itemRows.rows}
          total={model.total}
          unfilteredTotal={model.unfilteredTotal}
          hiddenInactiveCount={model.hiddenInactiveCount}
          narrowed={model.narrowed}
          view={filters.filters.view}
          sort={filters.filters.sort}
          world={model.world}
          selection={model.selection}
          pendingIds={model.pendingIds}
          online={online}
          onNavigate={navigate}
          onRetry={itemRows.refetch}
          onClear={model.clearEmptyFilters}
          onSort={(sort) => filters.setFilters({ sort })}
          onLoadMore={itemRows.fetchNextPage}
        />
      </div>
    </div>
  );
}

/** Renders the server-backed Items browser and all of its non-selection states. */
export function ItemsPage(): ReactElement {
  return <ItemsPageView model={useItemsPageModel()} />;
}
