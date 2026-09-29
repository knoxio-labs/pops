import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { useSelection } from '../../foundation/selection/use-selection.js';
import { unwrap } from '../../inventory-api-helpers.js';
import { webList } from '../../inventory-api/index.js';
import { usePendingItemIds } from '../../inventory-web/item-verbs.js';
import { containersQuery } from '../../inventory-web/items-url-filters.js';
import { listTrailState } from '../../inventory-web/list-trail.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { useContainersUrlFilters } from '../../inventory-web/useItemsUrlFilters.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useItemRows } from '../../inventory-web/useWebItems.js';
import { useWebSummary } from '../../inventory-web/useWebSummary.js';
import { labelsHref, MAX_LABEL_IDS } from '../labels-page/label-params.js';

/** The server and interaction state consumed by the Containers page sections. */
export type ContainersPageModel = ReturnType<typeof useContainersPageSources>;

function useContainerOpenItem(rows: readonly { id: string }[]): (id: string) => void {
  const location = useLocation();
  const navigate = useNavigate();
  return useCallback(
    (id: string): void => {
      void navigate(`/inventory/items/${id}`, {
        state: listTrailState({
          listName: 'Containers',
          href: `${location.pathname}${location.search}`,
          ids: rows.map((row) => row.id),
        }),
      });
    },
    [location.pathname, location.search, navigate, rows]
  );
}

function useContainerLabelPrinter(
  summary: ReturnType<typeof useWebSummary>,
  navigate: ReturnType<typeof useNavigate>
): { printing: boolean; printClosed: () => Promise<void> } {
  const [printing, setPrinting] = useState(false);
  const printClosed = useCallback(async (): Promise<void> => {
    const closedCount = summary.data?.packing.closed ?? 0;
    if (printing || closedCount === 0 || closedCount > MAX_LABEL_IDS) return;
    setPrinting(true);
    try {
      const page = unwrap(
        await webList({
          query: { isContainer: 'true', access: 'closed', limit: MAX_LABEL_IDS },
        })
      );
      void navigate(labelsHref(page.items.map((item) => item.id)));
    } catch {
      toast.error('Labels did not open. The inventory service did not answer.');
    } finally {
      setPrinting(false);
    }
  }, [navigate, printing, summary.data?.packing.closed]);
  return { printing, printClosed };
}

/** Loads the server-backed rows, summary, placement world, and selection verbs. */
export function useContainersPageSources() {
  const navigate = useNavigate();
  const filters = useContainersUrlFilters();
  const itemRows = useItemRows(containersQuery(filters.queryFilters), 50);
  const summary = useWebSummary();
  const online = useOnline();
  const catalogue = useCatalogueLookups();
  const placementSubject = useMemo(() => ({ kind: 'items' as const, ids: [] as const }), []);
  const placement = usePlacementSources(placementSubject);
  const pendingIds = usePendingItemIds();
  const selection = useSelection(itemRows.rows.map((row) => row.id));
  const openItem = useContainerOpenItem(itemRows.rows);
  const labelPrinter = useContainerLabelPrinter(summary, navigate);

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
  const retry = useCallback((): void => {
    itemRows.refetch();
    void summary.refetch();
  }, [itemRows, summary]);

  return {
    navigate,
    openItem,
    filters,
    itemRows,
    summary,
    online,
    catalogue,
    world,
    typeOptions,
    placeOptions,
    pendingIds,
    selection,
    printing: labelPrinter.printing,
    printClosed: labelPrinter.printClosed,
    retry,
  };
}
