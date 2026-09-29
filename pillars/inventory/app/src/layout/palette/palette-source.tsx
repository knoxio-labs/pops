import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useLocation } from 'react-router';

import { unwrap } from '../../inventory-api-helpers.js';
import { webList } from '../../inventory-api/index.js';
import { toItemRowModel } from '../../inventory-web/item-row-model.js';
import { useRecents } from '../../inventory-web/recents.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { usePurchasesSearch } from '../../inventory-web/usePurchasesSearch.js';
import {
  itemRecordCommand,
  locationRecordCommand,
  uniquePlacementTargets,
} from './palette-commands.js';
import { toUiPaletteSource } from './palette-groups.js';
import { usePaletteSearch } from './palette-search.js';
import {
  paletteCommands,
  paletteStatus,
  placementArgumentCommands,
  purchaseRecordCommands,
} from './palette-source-model.js';

import type { PickerSubject } from '../../foundation/model/contracts.js';
import type { ItemRowModel, PlacementTarget } from '../../foundation/model/model.js';
import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { WebListResponses } from '../../inventory-api/types.gen.js';
import type { PaletteSource, PaletteScope } from './palette-groups.js';

type RecentItemsResponse = WebListResponses['200'];

/** The URL-owned query and scope state supplied to the palette source. */
export interface InventoryPaletteInput {
  readonly query: string;
  readonly scope: PaletteScope;
}

/** The source and placement world used by the mounted inventory palette. */
export interface InventoryPaletteSourceState {
  readonly source: ReturnType<typeof toUiPaletteSource>;
  readonly world: PlacementWorld;
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Finds the item id only on an exact item-detail route. */
export function itemDetailId(pathname: string): string | null {
  const match = /^\/inventory\/items\/([^/]+)$/u.exec(pathname);
  return match?.[1] === undefined ? null : decodePathSegment(match[1]);
}

function recentItemIds(records: ReturnType<typeof useRecents>['records']): string[] {
  return records.filter((record) => record.kind === 'item').map((record) => record.id);
}

function useRecentItems(ids: readonly string[]): {
  readonly items: readonly ItemRowModel[];
} {
  const catalogue = useCatalogueLookups();
  const query = useQuery({
    queryKey: ['inventory', 'web', 'palette-recent-items', ids] as const,
    enabled: ids.length > 0,
    queryFn: async (): Promise<RecentItemsResponse> =>
      unwrap(
        await webList({
          query: {
            ids: ids.join(','),
            includeInactive: true,
            limit: ids.length,
            cursor: undefined,
          },
        })
      ),
  });
  const items = useMemo(
    () =>
      (query.data?.items ?? []).map((item) =>
        toItemRowModel(item, { typeNames: catalogue.typeNameById })
      ),
    [catalogue.typeNameById, query.data?.items]
  );
  return { items };
}

function mergedItems(
  world: PlacementWorld,
  recentItems: readonly ItemRowModel[]
): ReadonlyMap<string, ItemRowModel> {
  const items = new Map<string, ItemRowModel>(world.items);
  for (const item of recentItems) items.set(item.id, item);
  return items;
}

function recentCommands(
  records: ReturnType<typeof useRecents>['records'],
  items: ReadonlyMap<string, ItemRowModel>,
  locations: ReadonlyMap<string, LocationModel>,
  world: PlacementWorld
): InventoryPaletteSourceState['source']['commands'] {
  return records.flatMap((record) => {
    if (record.kind === 'item') {
      const item = items.get(record.id);
      return item === undefined ? [] : [itemRecordCommand(item, world, 'recents')];
    }
    const location = locations.get(record.id);
    return location === undefined ? [] : [locationRecordCommand(location, world, 'recents')];
  });
}

function placementTargets(
  recent: readonly PlacementTarget[],
  locations: readonly LocationModel[],
  openContainers: readonly ItemRowModel[]
): Exclude<PlacementTarget, { kind: 'in-hand' }>[] {
  return uniquePlacementTargets(recent, [
    ...locations.map((location) => ({ kind: 'location' as const, locationId: location.id })),
    ...openContainers.map((item) => ({ kind: 'container' as const, containerId: item.id })),
  ]);
}

/** Builds the live palette source from inventory data and browser recents. */
export function useInventoryPaletteSource(
  input: InventoryPaletteInput
): InventoryPaletteSourceState {
  const location = useLocation();
  const recents = useRecents();
  const currentItemId = itemDetailId(location.pathname);
  const subject = useMemo<PickerSubject>(
    () => ({ kind: 'items', ids: currentItemId === null ? [] : [currentItemId] }),
    [currentItemId]
  );
  const placement = usePlacementSources(subject);
  const recentIds = useMemo(() => recentItemIds(recents.records), [recents.records]);
  const recentItems = useRecentItems(recentIds);
  const items = useMemo(
    () => mergedItems(placement.world, recentItems.items),
    [placement.world, recentItems.items]
  );
  const search = usePaletteSearch(input.query, input.scope, placement.world);
  const purchaseSearch = usePurchasesSearch(
    input.scope === 'purchases' ? search.debouncedQuery : ''
  );
  const purchaseRecords = useMemo(
    () => purchaseRecordCommands(purchaseSearch.hits),
    [purchaseSearch.hits]
  );
  const currentItem = currentItemId === null ? undefined : items.get(currentItemId);
  const commands = useMemo(() => paletteCommands(currentItem), [currentItem]);
  const recent = useMemo(
    () => recentCommands(recents.records, items, placement.world.locations, placement.world),
    [items, placement.world, recents.records]
  );
  const targets = useMemo(
    () => placementTargets(placement.recents, placement.locations, placement.openContainers),
    [placement.locations, placement.openContainers, placement.recents]
  );
  const argumentCommands = useMemo(
    () => placementArgumentCommands(targets, placement.world),
    [placement.world, targets]
  );
  const source = useMemo<PaletteSource>(
    () => ({
      commands,
      inventoryRecords: search.records,
      purchaseRecords,
      recents: recent,
      arguments: { placement: argumentCommands },
      status: (query, scope, step) =>
        paletteStatus({ search, purchaseSearch, placement, query, scope, step }),
    }),
    [argumentCommands, commands, placement, purchaseRecords, purchaseSearch, recent, search]
  );

  return { source: toUiPaletteSource(source), world: placement.world };
}

/** Reads the scope that the current Search URL owns, defaulting to Inventory. */
export { paletteScopeFromUrl } from './palette-url.js';
