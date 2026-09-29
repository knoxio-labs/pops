import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { WEB_ITEMS_MAX_IDS } from '@pops/inventory';

import { unwrap } from '../../inventory-api-helpers.js';
import { webList } from '../../inventory-api/index.js';
import { itemsQuery } from '../../inventory-web/items-url-filters.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { downloadCsv, exportCsv, templateCsv } from './inventory-csv.js';
import { toExportRows } from './inventory-export-model.js';

import type { WebListData, WebListResponses } from '../../inventory-api/types.gen.js';
import type { WebItem } from '../../inventory-web/item-row-model.js';
import type { ItemsUrlFilters } from '../../inventory-web/items-url-filters.js';

type WebListPage = WebListResponses['200'];
type PlacementSources = ReturnType<typeof usePlacementSources>;

const EMPTY_PLACEMENT_SUBJECT = { kind: 'items', ids: [] as const } as const;
const EXPORT_FAILURE_MESSAGE = 'Export failed. Nothing was downloaded.';

/** The export operations exposed by the Items page. */
export interface ItemsExport {
  readonly exportView: (filters: ItemsUrlFilters) => Promise<void>;
  readonly exportSelection: (ids: readonly string[]) => Promise<void>;
  readonly exportTemplate: () => void;
  readonly busy: boolean;
}

interface ExportBatch {
  readonly rows: readonly WebItem[];
  readonly containerNames: ReadonlyMap<string, string>;
}

async function fetchPage(query: WebListData['query']): Promise<WebListPage> {
  return unwrap(await webList({ query }));
}

function chunks<T>(values: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += WEB_ITEMS_MAX_IDS) {
    result.push(values.slice(index, index + WEB_ITEMS_MAX_IDS));
  }
  return result;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

async function fetchMissingContainerNames(
  rows: readonly WebItem[],
  world: PlacementSources['world'],
  names: Map<string, string>,
  queriedIds: Set<string>
): Promise<void> {
  const rowsById = new Map(rows.map((row) => [row.id, row] as const));
  const unresolved = new Set<string>();

  for (const row of rows) {
    if (row.placement.kind !== 'container') continue;
    const id = row.placement.itemId;
    const exportedName = nonEmpty(rowsById.get(id)?.name);
    if (exportedName !== undefined) {
      names.set(id, exportedName);
      continue;
    }

    const activeName = nonEmpty(world.items.get(id)?.name);
    if (activeName !== undefined) {
      names.set(id, activeName);
      continue;
    }

    if (!queriedIds.has(id)) unresolved.add(id);
  }

  for (const ids of chunks([...unresolved])) {
    ids.forEach((id) => queriedIds.add(id));
    const page = await fetchPage({
      ids: ids.join(','),
      includeInactive: true,
      limit: WEB_ITEMS_MAX_IDS,
    });
    const requested = new Set(ids);
    for (const item of page.items) {
      if (requested.has(item.id)) names.set(item.id, item.name);
    }
  }
}

async function fetchView(
  filters: ItemsUrlFilters,
  placement: PlacementSources
): Promise<ExportBatch> {
  const rows: WebItem[] = [];
  const containerNames = new Map<string, string>();
  const queriedContainerIds = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await fetchPage({ ...itemsQuery(filters), limit: WEB_ITEMS_MAX_IDS, cursor });
    rows.push(...page.items);
    await fetchMissingContainerNames(rows, placement.world, containerNames, queriedContainerIds);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);

  return { rows, containerNames };
}

async function fetchSelection(
  ids: readonly string[],
  placement: PlacementSources
): Promise<ExportBatch> {
  const rows: WebItem[] = [];
  const containerNames = new Map<string, string>();
  const queriedContainerIds = new Set<string>();

  for (const chunk of chunks(ids)) {
    const page = await fetchPage({
      ids: chunk.join(','),
      includeInactive: true,
      limit: WEB_ITEMS_MAX_IDS,
    });
    const rowsById = new Map(page.items.map((row) => [row.id, row] as const));
    rows.push(
      ...chunk.flatMap((id) => {
        const row = rowsById.get(id);
        return row === undefined ? [] : [row];
      })
    );
    await fetchMissingContainerNames(rows, placement.world, containerNames, queriedContainerIds);
  }

  return { rows, containerNames };
}

function localDateStamp(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Exports the current Items view or a selection using only existing web reads. */
export function useItemsExport(): ItemsExport {
  const catalogue = useCatalogueLookups();
  const placement = usePlacementSources(EMPTY_PLACEMENT_SUBJECT);
  const [exporting, setExporting] = useState(false);
  const placementLoading = placement.isLoading;
  const busy = exporting || placementLoading;

  const runExport = useCallback(
    async (load: () => Promise<ExportBatch>, filename: string): Promise<void> => {
      if (busy) return;
      setExporting(true);
      try {
        const batch = await load();
        const rows = toExportRows({
          rows: batch.rows,
          containerNames: batch.containerNames,
          types: catalogue.types,
          world: placement.world,
        });
        downloadCsv(filename, exportCsv(rows));
      } catch {
        toast.error(EXPORT_FAILURE_MESSAGE);
      } finally {
        setExporting(false);
      }
    },
    [busy, catalogue.types, placement.world]
  );

  const exportView = useCallback(
    (filters: ItemsUrlFilters): Promise<void> =>
      runExport(
        () => fetchView(filters, placement),
        `inventory-items-${localDateStamp(new Date())}.csv`
      ),
    [placement, runExport]
  );

  const exportSelection = useCallback(
    (ids: readonly string[]): Promise<void> =>
      runExport(
        () => fetchSelection(ids, placement),
        `inventory-items-${localDateStamp(new Date())}.csv`
      ),
    [placement, runExport]
  );

  const exportTemplate = useCallback((): void => {
    if (busy) return;
    downloadCsv('inventory-import-template.csv', templateCsv());
  }, [busy]);

  return { exportView, exportSelection, exportTemplate, busy };
}
