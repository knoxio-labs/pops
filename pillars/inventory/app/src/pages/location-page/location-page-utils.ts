import { InventoryApiError } from '../../inventory-api-helpers.js';
import { LOCATIONS_TREE_QUERY_KEY, WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { LOCATION_TALLIES_QUERY_KEY } from '../../inventory-web/useLocationTallies.js';

import type { QueryClient } from '@tanstack/react-query';

/** Converts an inventory request failure into safe page copy. */
export function inventoryErrorMessage(error: unknown): string {
  if (error instanceof InventoryApiError) {
    return error.code === undefined ? error.message : `${error.message} (${error.code})`;
  }
  if (error instanceof Error) return error.message;
  return 'The inventory service did not answer. Nothing was changed.';
}

/** Invalidates the location tree, server tallies, and web item projections together. */
export function invalidateLocationData(queryClient: QueryClient): void {
  for (const queryKey of [
    LOCATIONS_TREE_QUERY_KEY,
    LOCATION_TALLIES_QUERY_KEY,
    WEB_ITEMS_QUERY_KEY,
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
