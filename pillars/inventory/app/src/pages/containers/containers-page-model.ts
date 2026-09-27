import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';

import { useListPageKeys } from '../../foundation/list-page/use-list-page-keys.js';
import { buildWorld } from '../../foundation/model/placement-model.js';
import { useSelection } from '../../foundation/selection/use-selection.js';
import { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import { usePendingItemIds } from '../../inventory-web/item-verbs.js';
import { containersQuery } from '../../inventory-web/items-url-filters.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { useContainersUrlFilters } from '../../inventory-web/useItemsUrlFilters.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useItemRows } from '../../inventory-web/useWebItems.js';
import { useWebSummary } from '../../inventory-web/useWebSummary.js';
import { MAX_LABEL_IDS } from '../labels-page/label-params.js';
import { printableContainerIds } from './containers-model.js';
import { useContainerSelectionActions } from './containers-selection.js';

/** The server and interaction state consumed by the Containers page sections. */
export type ContainersPageModel = ReturnType<typeof useContainersPageSources>;

/** Loads the server-backed rows, summary, placement world, and selection verbs. */
export function useContainersPageSources() {
  const navigate = useNavigate();
  const filters = useContainersUrlFilters();
  const itemRows = useItemRows(containersQuery(filters.queryFilters));
  const closedRows = useItemRows(
    { isContainer: 'true', access: 'closed', sort: 'name' },
    MAX_LABEL_IDS
  );
  const summary = useWebSummary();
  const online = useOnline();
  const catalogue = useCatalogueLookups();
  const placementSubject = useMemo(() => ({ kind: 'items' as const, ids: [] as const }), []);
  const placement = usePlacementSources(placementSubject);
  const pendingIds = usePendingItemIds();
  const selection = useSelection(itemRows.rows.map((row) => row.id));
  const verbs = useBulkItemVerbs();
  useListPageKeys({ rows: itemRows.rows, selection });

  const world = useMemo(
    () =>
      buildWorld(
        [...placement.world.items.values(), ...itemRows.rows],
        [...placement.world.locations.values()]
      ),
    [itemRows.rows, placement.world]
  );
  const typeOptions = useMemo(() => catalogue.types, [catalogue.types]);
  const placeOptions = useMemo(() => [...world.locations.values()], [world]);
  const selectionActionsModel = useContainerSelectionActions({
    selection,
    world,
    online,
    navigate,
    verbs,
  });
  const closedIds = useMemo(() => printableContainerIds(closedRows.rows), [closedRows.rows]);
  const retry = useCallback((): void => {
    itemRows.refetch();
    closedRows.refetch();
    void summary.refetch();
  }, [closedRows, itemRows, summary]);

  return {
    navigate,
    filters,
    itemRows,
    summary,
    online,
    world,
    typeOptions,
    placeOptions,
    pendingIds,
    selection,
    selectionActions: selectionActionsModel.actions,
    rejections: selectionActionsModel.rejections,
    closedIds,
    retry,
  };
}
