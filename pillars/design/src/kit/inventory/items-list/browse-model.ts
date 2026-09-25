/**
 * What the Items and Containers browsers show for a set of filters: which
 * rows pass, in what order, how many inactive rows the default view hides,
 * and the query string the filters live in (spec 2.2), so a filtered view is
 * a bookmark.
 */
import { effectiveLocationId, isLocationWithin, isWithin, rankMatch } from '../foundation';

import type { ItemRowModel, PlacementWorld } from '../foundation';

/** How the rows are drawn. */
export type ItemsView = 'table' | 'compact' | 'cards';

/** What the rows are ordered by when nothing is typed. */
export type ItemsSort = 'name' | 'updated' | 'type' | 'where';

/** Every filter the browser has. `within` is a location or container id. */
export interface ItemsFilters {
  q: string;
  typeId: string | null;
  untyped: boolean;
  inactive: boolean;
  within: string | null;
  sort: ItemsSort;
}

/** Nothing typed, nothing narrowed, active items only, by name. */
export const DEFAULT_FILTERS: ItemsFilters = {
  q: '',
  typeId: null,
  untyped: false,
  inactive: false,
  within: null,
  sort: 'name',
};

/** Filters that narrow the list, not counting the search text or the sort. */
export function activeFilterCount(filters: ItemsFilters): number {
  const narrowing = [
    filters.typeId !== null || filters.untyped,
    filters.within !== null,
    filters.inactive,
  ];
  return narrowing.filter(Boolean).length;
}

/** Whether anything at all narrows the list, search text included. */
export function isNarrowed(filters: ItemsFilters): boolean {
  return filters.q.trim() !== '' || activeFilterCount(filters) > 0;
}

function passesType(item: ItemRowModel, filters: ItemsFilters): boolean {
  if (filters.untyped) return item.typeId === null;
  return filters.typeId === null || item.typeId === filters.typeId;
}

/** Whether an item sits somewhere under `within`, never counting the place itself. */
export function sitsWithin(world: PlacementWorld, item: ItemRowModel, within: string): boolean {
  if (item.id === within) return false;
  if (world.items.has(within)) return isWithin(world, item.id, within);
  const locationId = effectiveLocationId(world, item.id);
  return locationId !== null && isLocationWithin(world, locationId, within);
}

function textRank(item: ItemRowModel, q: string): number {
  return rankMatch(q, item.name, [item.code ?? '', item.note ?? '', item.typeName ?? '']);
}

function nullsLast(a: string | null, b: string | null): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0);
  return a.localeCompare(b);
}

const COMPARE: Readonly<
  Record<ItemsSort, (a: ItemRowModel, b: ItemRowModel, world: PlacementWorld) => number>
> = {
  name: (a, b) => a.name.localeCompare(b.name),
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  type: (a, b) => nullsLast(a.typeName, b.typeName),
  where: (a, b, world) =>
    nullsLast(effectiveLocationId(world, a.id), effectiveLocationId(world, b.id)),
};

/**
 * The rows a filter set shows. With search text, a name that starts with it
 * beats one that contains it, which beats a match in code, note or type;
 * the chosen sort breaks ties.
 */
export function applyFilters(
  items: readonly ItemRowModel[],
  world: PlacementWorld,
  filters: ItemsFilters
): ItemRowModel[] {
  const q = filters.q.trim();
  const within = filters.within;
  return items
    .filter((item) => filters.inactive || item.lifecycle === 'active')
    .filter((item) => passesType(item, filters))
    .filter((item) => within === null || sitsWithin(world, item, within))
    .map((item) => ({ item, rank: q === '' ? 1 : textRank(item, q) }))
    .filter((scored) => scored.rank > 0)
    .toSorted((a, b) => b.rank - a.rank || COMPARE[filters.sort](a.item, b.item, world))
    .map((scored) => scored.item);
}

/** Inactive rows these filters would show with Include inactive, for "38 inactive not shown". */
export function hiddenInactive(
  items: readonly ItemRowModel[],
  world: PlacementWorld,
  filters: ItemsFilters
): number {
  if (filters.inactive) return 0;
  return (
    applyFilters(items, world, { ...filters, inactive: true }).length -
    applyFilters(items, world, filters).length
  );
}

/** The query string a filter set and view serialise to; defaults are left out. */
export function itemsQuery(filters: ItemsFilters, view: ItemsView = 'table'): string {
  const params = new URLSearchParams();
  if (filters.q.trim() !== '') params.set('q', filters.q.trim());
  if (filters.untyped) params.set('untyped', '1');
  else if (filters.typeId !== null) params.set('type', filters.typeId);
  if (filters.within !== null) params.set('placement', filters.within);
  if (filters.inactive) params.set('inactive', '1');
  if (filters.sort !== 'name') params.set('sort', filters.sort);
  if (view !== 'table') params.set('view', view);
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}
