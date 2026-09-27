import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import {
  isNarrowed,
  placeFilterOptions,
  typeFilterOptions,
} from '../../foundation/list-page/list-filters.js';
import { buildWorld } from '../../foundation/model/placement-model.js';
import { useSelection } from '../../foundation/selection/use-selection.js';
import { usePendingItemIds } from '../../inventory-web/item-verbs.js';
import { itemsQuery } from '../../inventory-web/items-url-filters.js';
import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import { useItemsUrlFilters } from '../../inventory-web/useItemsUrlFilters.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useItemRows } from '../../inventory-web/useWebItems.js';
import { findDuplicatePair } from './items-banners.js';
import { ItemsPageView } from './items-page-view.js';

import type { ReactElement } from 'react';

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

export type ItemsPageModel = ReturnType<typeof useItemsPageModel>;

/** Renders the server-backed Items browser and all of its non-selection states. */
export function ItemsPage(): ReactElement {
  return <ItemsPageView model={useItemsPageModel()} />;
}
