import { locationPath } from '../model/placement-model';

import type {
  SearchItemHit,
  SearchPlaceHit,
  WebSearchResults,
} from '../../inventory-web/useWebSearch';
import type { PlacementWorld } from '../model/placement-model';

/** The two scopes exposed by inventory search. */
export type SearchScope = 'inventory' | 'purchases';

/** The display label for each inventory search scope. */
export const SEARCH_SCOPE_LABELS: Readonly<Record<SearchScope, string>> = {
  inventory: 'Inventory',
  purchases: 'Purchases',
};

/** The inventory portion of a web search response used by search surfaces. */
export type InventoryResults = Pick<WebSearchResults, 'exact' | 'items' | 'places'>;

/** Splits server-ordered item hits into name matches and other-field matches. */
export function splitHits(items: readonly SearchItemHit[]): {
  byName: SearchItemHit[];
  elsewhere: SearchItemHit[];
} {
  return {
    byName: items.filter((hit) => hit.tier !== 'other'),
    elsewhere: items.filter((hit) => hit.tier === 'other'),
  };
}

/** Returns result ids in page order, preserving the order supplied by the server. */
export function resultOrder(results: InventoryResults): string[] {
  const { byName, elsewhere } = splitHits(results.items);
  return [
    ...(results.exact ? [results.exact.id] : []),
    ...byName.map((hit) => hit.item.id),
    ...results.places.map((hit) => hit.place.id),
    ...elsewhere.map((hit) => hit.item.id),
  ];
}

/** Returns the next active id, clamped at both ends of the supplied order. */
export function stepActive(
  order: readonly string[],
  activeId: string | null,
  delta: number
): string | null {
  if (order.length === 0) return null;
  const index = activeId === null ? -1 : order.indexOf(activeId);
  if (index === -1) return order[0] ?? null;
  return order[Math.min(order.length - 1, Math.max(0, index + delta))] ?? null;
}

/** One server-ordered inventory item or place row for a typeahead. */
export type TypeaheadRow = { kind: 'item'; hit: SearchItemHit; exact: boolean } | SearchPlaceHit;

/** Returns the page-order typeahead prefix, marking an exact-code item. */
export function typeaheadRows(results: InventoryResults, limit = 8): TypeaheadRow[] {
  const { byName, elsewhere } = splitHits(results.items);
  const exact: TypeaheadRow[] = results.exact
    ? [
        {
          kind: 'item',
          hit: { kind: 'item', item: results.exact, tier: 'prefix', field: 'code' },
          exact: true,
        },
      ]
    : [];
  return [
    ...exact,
    ...byName.map((hit): TypeaheadRow => ({ kind: 'item', hit, exact: false })),
    ...results.places,
    ...elsewhere.map((hit): TypeaheadRow => ({ kind: 'item', hit, exact: false })),
  ].slice(0, limit);
}

/** Returns a place's parent names, omitting the place itself. */
export function parentPath(world: PlacementWorld, locationId: string): string {
  return locationPath(world, locationId)
    .slice(0, -1)
    .map((location) => location.name)
    .join(' › ');
}
