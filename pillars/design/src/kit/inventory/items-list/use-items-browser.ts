/**
 * The Items browser's state in one hook: filters, view and the shared
 * selection, plus what the page derives from them (the rows to mount, the
 * counts, the chips, the address). On the real page filters and view come
 * from the URL; the canvas cannot own one, so a seed stands in.
 */
import { useMemo, useState } from 'react';

import { EMPTY_SELECTION, useSelection } from '../foundation';
import { descendantIds } from '../type-tree/model';
import { DEFAULT_FILTERS, applyFilters, hiddenInactive, itemsQuery } from './browse-model';

import type { ItemRowModel, PlacementWorld, SelectionApi } from '../foundation';
import type { TypeTreeRecord } from '../type-tree/model';
import type { ItemsFilters, ItemsView } from './browse-model';
import type { FilterOption } from './filter-popover';
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
const EMPTY_FILTER_OPTIONS: readonly FilterOption[] = [];

function typeChip(
  filters: ItemsFilters,
  items: readonly ItemRowModel[],
  types: readonly TypeTreeRecord[],
  set: (patch: Partial<ItemsFilters>) => void
): SummaryChip | null {
  if (filters.untyped)
    return { id: 'untyped', label: 'No type', onRemove: () => set({ untyped: false }) };
  if (filters.typeId === null) return null;
  const typeName =
    types.find((type) => type.id === filters.typeId)?.label ??
    items.find((item) => item.typeId === filters.typeId)?.typeName ??
    'Unknown';
  const subtypeCount = descendantIds(types, filters.typeId).length;
  return {
    id: 'type',
    label: `Type: ${typeName}${subtypeCount > 0 ? ` + ${String(subtypeCount)} subtypes` : ''}`,
    onRemove: () => set({ typeId: null }),
  };
}

function withinChip(
  filters: ItemsFilters,
  world: PlacementWorld,
  set: (patch: Partial<ItemsFilters>) => void
): SummaryChip | null {
  if (filters.within === null) return null;
  const name =
    world.locations.get(filters.within)?.name ?? world.items.get(filters.within)?.name ?? '';
  return { id: 'within', label: `In ${name}`, onRemove: () => set({ within: null }) };
}

function chipsFor({
  filters,
  items,
  world,
  types,
  set,
}: {
  filters: ItemsFilters;
  items: readonly ItemRowModel[];
  world: PlacementWorld;
  types: readonly TypeTreeRecord[];
  set: (patch: Partial<ItemsFilters>) => void;
}): SummaryChip[] {
  const chips = [typeChip(filters, items, types, set), withinChip(filters, world, set)];
  if (filters.inactive)
    chips.push({
      id: 'inactive',
      label: 'Including inactive',
      onRemove: () => set({ inactive: false }),
    });
  return chips.filter((chip): chip is SummaryChip => chip !== null);
}

/** The browser over one population. */
export function useItemsBrowser(
  items: readonly ItemRowModel[],
  world: PlacementWorld,
  seed: BrowserSeed = {},
  options: { path?: string; typeOptions?: readonly FilterOption[] } = {}
): ItemsBrowser {
  const typeOptions = options.typeOptions ?? EMPTY_FILTER_OPTIONS;
  const types = useMemo<readonly TypeTreeRecord[]>(
    () =>
      typeOptions.map((type) => ({
        id: type.value,
        label: type.label,
        parentTypeId: type.parentTypeId ?? null,
      })),
    [typeOptions]
  );
  const [filters, setAll] = useState<ItemsFilters>({ ...DEFAULT_FILTERS, ...seed.filters });
  const [view, setView] = useState<ItemsView>(seed.view ?? 'table');
  const matching = useMemo(
    () => applyFilters(items, world, filters, types),
    [items, world, filters, types]
  );
  const rows = useMemo(() => matching.slice(0, WINDOW), [matching]);
  const order = useMemo(() => rows.map((row) => row.id), [rows]);
  const selection = useSelection(order, {
    ...EMPTY_SELECTION,
    selected: new Set(seed.selected ?? []),
    anchorId: seed.selected?.at(-1) ?? null,
    focusedId: seed.focusedId ?? null,
  });
  const hidden = useMemo(
    () => hiddenInactive(items, world, filters, types),
    [items, world, filters, types]
  );
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
    chips: chipsFor({ filters, items, world, types, set: setFilters }),
    address: `${options.path ?? '/inventory/items'}${itemsQuery(filters, view)}`,
    selection,
    setFilters,
    clearFilters: () => setAll({ ...DEFAULT_FILTERS, q: filters.q, sort: filters.sort }),
    setView,
  };
}
