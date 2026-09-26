/**
 * Shared React Query keys for the web data layer, so a mutation hook can
 * invalidate exactly what a query hook reads without either importing the
 * other's implementation.
 */
export const WEB_ITEMS_QUERY_KEY = ['inventory', 'web', 'items'] as const;

/** The shared cache key for the published type catalogue. */
export const CATALOGUE_QUERY_KEY = ['inventory', 'type-catalogue', 'published'] as const;

/** Alias for the published catalogue key used by the catalogue editor. */
export const PUBLISHED_CATALOGUE_QUERY_KEY = CATALOGUE_QUERY_KEY;

/** The cache key for the inventory location tree used by placement pickers. */
export const LOCATION_TREE_QUERY_KEY = ['inventory', 'locations', 'tree'] as const;

/** Alias matching the plural naming used by location-facing callers. */
export const LOCATIONS_TREE_QUERY_KEY = LOCATION_TREE_QUERY_KEY;

/** The root cache key for placement-picker source queries. */
export const PLACEMENT_SOURCES_QUERY_KEY = ['inventory', 'web', 'placement-sources'] as const;

/** The query key for one item's `GET /web/items/:id` page (any history cursor). */
export function webItemDetailQueryKey(id: string) {
  return ['inventory', 'web', 'items', id] as const;
}
