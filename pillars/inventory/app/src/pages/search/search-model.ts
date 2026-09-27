import type {
  SearchItemHit,
  SearchPlaceHit,
  WebSearchResults,
} from '../../inventory-web/useWebSearch.js';

/** The two result sources available to inventory search. */
export type SearchScope = 'inventory' | 'purchases';

/** URL-owned non-text filters used by the inventory scope. */
export interface SearchFilters {
  readonly typeKey: string | null;
  readonly within: string | null;
}

/** The display order of the search scopes. */
export const SEARCH_SCOPES: readonly SearchScope[] = ['inventory', 'purchases'];

/** Returns a supported search scope, defaulting malformed URL values safely. */
export function parseSearchScope(value: string | null): SearchScope {
  return value === 'purchases' ? 'purchases' : 'inventory';
}

/** Returns the stable DOM id used by a result option and its active descendant. */
export function searchResultDomId(kind: string, id: string): string {
  return `search-result-${kind}-${encodeURIComponent(id)}`;
}

/** Preserves the server's inventory ranking while grouping exact, item, and place hits. */
export function inventoryResultOrder(results: WebSearchResults): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  if (results.exact !== null) add(results.exact.id);
  results.items.filter((hit) => hit.tier !== 'other').forEach((hit) => add(hit.item.id));
  results.places.forEach((hit) => add(hit.place.id));
  results.items.filter((hit) => hit.tier === 'other').forEach((hit) => add(hit.item.id));
  return ordered;
}

/** Returns item hits in the server-provided order without applying client ranking. */
export function inventoryItemHits(results: WebSearchResults): SearchItemHit[] {
  return results.items.slice();
}

/** Returns place hits in the server-provided order without applying client ranking. */
export function inventoryPlaceHits(results: WebSearchResults): SearchPlaceHit[] {
  return results.places.slice();
}

/** Moves an active result by one keyboard step and clamps at both list ends. */
export function stepSearchResult(
  activeId: string | null,
  order: readonly string[],
  delta: number
): string | null {
  if (order.length === 0) return null;
  const currentIndex = activeId === null ? -1 : order.indexOf(activeId);
  const nextIndex =
    currentIndex === -1 ? 0 : Math.min(order.length - 1, Math.max(0, currentIndex + delta));
  return order[nextIndex] ?? null;
}

/** Returns whether a search request is still settling after URL state changed. */
export function isSearchDebouncing(
  query: string,
  debouncedQuery: string,
  filters: SearchFilters,
  debouncedFilters: SearchFilters
): boolean {
  return (
    query !== debouncedQuery ||
    filters.typeKey !== debouncedFilters.typeKey ||
    filters.within !== debouncedFilters.within
  );
}
