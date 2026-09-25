/**
 * The Items browser's state in one hook: filters, view and the shared
 * selection, plus what the page derives from them (the rows to mount, the
 * counts, the chips, the address). On the real page filters and view come
 * from the URL; the canvas cannot own one, so a seed stands in.
 */
import { useMemo, useState } from 'react';

import { EMPTY_SELECTION, useSelection } from '../foundation';
import { DEFAULT_FILTERS, applyFilters, hiddenInactive, itemsQuery } from './browse-model';

import type { ItemRowModel, PlacementWorld, SelectionApi } from '../foundation';
import type { ItemsFilters, ItemsView } from './browse-model';
import type { SummaryChip } from './items-summary';

/** Where a design state opens the browser. */
export interface BrowserSeed {
  filters?: Partial<ItemsFilters>;
  view?: ItemsView;
  selected?: readonly string[];
  focusedId?: string;
}

/** What {@link useItemsBrowser} hands the page. */
export interface ItemsBrowser {
  filters: ItemsFilters;
  view: ItemsView;
  rows: ItemRowModel[];
  total: number;
  /** Rows with no filter but the inactive switch: what "of N" counts. */
  baseline: number;
  hidden: number;
  chips: SummaryChip[];
  address: string;
  selection: SelectionApi;
  setFilters: (patch: Partial<ItemsFilters>) => void;
  clearFilters: () => void;
  setView: (view: ItemsView) => void;
}

/** Rows mounted at once; the rest page in on scroll. */
export const WINDOW = 60;

function chipsFor(
  filters: ItemsFilters,
  items: readonly ItemRowModel[],
  world: PlacementWorld,
  set: (patch: Partial<ItemsFilters>) => void
): SummaryChip[] {
  const chips: SummaryChip[] = [];
  const typeName = items.find((item) => item.typeId === filters.typeId)?.typeName ?? 'Unknown';
  if (filters.untyped)
    chips.push({ id: 'untyped', label: 'No type', onRemove: () => set({ untyped: false }) });
  else if (filters.typeId !== null)
    chips.push({ id: 'type', label: `Type: ${typeName}`, onRemove: () => set({ typeId: null }) });
  if (filters.within !== null) {
    const name =
      world.locations.get(filters.within)?.name ?? world.items.get(filters.within)?.name ?? '';
    chips.push({ id: 'within', label: `In ${name}`, onRemove: () => set({ within: null }) });
  }
  if (filters.inactive)
    chips.push({
      id: 'inactive',
      label: 'Including inactive',
      onRemove: () => set({ inactive: false }),
    });
  return chips;
}

/** The browser over one population. */
export function useItemsBrowser(
  items: readonly ItemRowModel[],
  world: PlacementWorld,
  seed: BrowserSeed = {},
  path = '/inventory/items'
): ItemsBrowser {
  const [filters, setAll] = useState<ItemsFilters>({ ...DEFAULT_FILTERS, ...seed.filters });
  const [view, setView] = useState<ItemsView>(seed.view ?? 'table');
  const matching = useMemo(() => applyFilters(items, world, filters), [items, world, filters]);
  const rows = useMemo(() => matching.slice(0, WINDOW), [matching]);
  const order = useMemo(() => rows.map((row) => row.id), [rows]);
  const selection = useSelection(order, {
    ...EMPTY_SELECTION,
    selected: new Set(seed.selected ?? []),
    anchorId: seed.selected?.at(-1) ?? null,
    focusedId: seed.focusedId ?? null,
  });
  const hidden = useMemo(() => hiddenInactive(items, world, filters), [items, world, filters]);
  const setFilters = (patch: Partial<ItemsFilters>) =>
    setAll((current) => ({ ...current, ...patch }));
  return {
    filters,
    view,
    rows,
    total: matching.length,
    baseline: filters.inactive
      ? items.length
      : items.filter((item) => item.lifecycle === 'active').length,
    hidden,
    chips: chipsFor(filters, items, world, setFilters),
    address: `${path}${itemsQuery(filters, view)}`,
    selection,
    setFilters,
    clearFilters: () => setAll({ ...DEFAULT_FILTERS, q: filters.q, sort: filters.sort }),
    setView,
  };
}
