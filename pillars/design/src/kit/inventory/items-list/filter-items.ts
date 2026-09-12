import type { SelectOption } from '@pops/ui';

/**
 * Ported from `pillars/inventory/app/src/pages/items-page/useItemsPageLocations.ts`.
 * A location tree node shape general enough for the fixture tree and the
 * app's own `LocationTreeNode` to both satisfy it.
 */
export interface LocationTreeNodeShape {
  id: string;
  name: string;
  children: LocationTreeNodeShape[];
}

export interface LocationSegmentShape {
  id: string;
  name: string;
}

/** Ported as-is from `useItemsPageLocations.ts`. */
export function flattenLocations(nodes: LocationTreeNodeShape[]): SelectOption[] {
  const opts: SelectOption[] = [{ value: '', label: 'All Locations' }];
  function walk(items: LocationTreeNodeShape[], depth: number): void {
    for (const node of items) {
      const indent = depth > 0 ? '  '.repeat(depth) + '└ ' : '';
      opts.push({ value: node.id, label: `${indent}${node.name}` });
      walk(node.children, depth + 1);
    }
  }
  walk(nodes, 0);
  return opts;
}

/** Ported as-is from `useItemsPageLocations.ts`. */
export function buildLocationPathMap(
  nodes: LocationTreeNodeShape[]
): ReadonlyMap<string, LocationSegmentShape[]> {
  const map = new Map<string, LocationSegmentShape[]>();
  function walk(items: LocationTreeNodeShape[], ancestors: LocationSegmentShape[]): void {
    for (const node of items) {
      const path = [...ancestors, { id: node.id, name: node.name }];
      map.set(node.id, path);
      walk(node.children, path);
    }
  }
  walk(nodes, []);
  return map;
}

/**
 * The subset of `useItemsPageFilters.ts`'s `Filters` that `hasAnyActiveFilter`
 * reads. Ported as-is; `search` is deliberately excluded, matching the source
 * (a search term alone does not count as an "active filter" there, which is
 * why the app checks `!!filters.search || model.hasActiveFilters` rather than
 * folding search into this function).
 */
export interface ActiveFilterFlags {
  typeFilter: string;
  conditionFilter: string;
  inUseFilter: string;
  locationFilter: string;
}

/** Ported as-is from `useItemsPageFilters.ts`. */
export function hasAnyActiveFilter(filters: ActiveFilterFlags): boolean {
  return Boolean(
    filters.typeFilter || filters.conditionFilter || filters.inUseFilter || filters.locationFilter
  );
}

export interface ItemsFilterState extends ActiveFilterFlags {
  search: string;
}

export interface FilterableItem {
  itemName: string;
  type: string | null;
  condition: string | null;
  inUse: boolean;
  locationId: string | null;
}

/**
 * The canvas's stand-in for the server query the app sends through
 * `buildQueryInput` (`useItemsPageFilters.ts`). The predicates mirror
 * `pillars/inventory/src/api/modules/items/service.ts`'s `buildInventoryConditions`:
 * `search` is a substring match on `itemName` only, not `assetId`: the
 * placeholder's "or asset IDs" is answered by the separate exact-match
 * lookup on Enter, not by this filter. `condition` compares
 * case-insensitively, `locationId` matches exactly with no descendant
 * expansion (the list call never sets `includeChildren`), and every other
 * field is an exact match.
 */
export function filterInventoryItems<T extends FilterableItem>(
  items: T[],
  filters: ItemsFilterState
): T[] {
  const search = filters.search.trim().toLowerCase();
  const condition = filters.conditionFilter.toLowerCase();
  return items.filter((item) => {
    if (search && !item.itemName.toLowerCase().includes(search)) return false;
    if (filters.typeFilter && item.type !== filters.typeFilter) return false;
    if (condition && (item.condition ?? '').toLowerCase() !== condition) return false;
    if (filters.inUseFilter && item.inUse !== (filters.inUseFilter === 'true')) return false;
    if (filters.locationFilter && item.locationId !== filters.locationFilter) return false;
    return true;
  });
}
