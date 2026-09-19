/**
 * Shared React Query keys for the web data layer, so a mutation hook can
 * invalidate exactly what a query hook reads without either importing the
 * other's implementation.
 */
export const WEB_ITEMS_QUERY_KEY = ['inventory', 'web', 'items'] as const;

/** The query key for one item's `GET /web/items/:id` page (any history cursor). */
export function webItemDetailQueryKey(id: string) {
  return ['inventory', 'web', 'items', id] as const;
}
