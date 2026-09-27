import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { unwrap } from '../../inventory-api-helpers.js';
import { webLocationsGone } from '../../inventory-api/index.js';
import { LOCATIONS_TREE_QUERY_KEY } from '../../inventory-web/queryKeys.js';

/** Loads the deleted-location summary only after the live tree misses the id. */
export function useLocationGoneQuery(pageId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['inventory', 'web', 'location-gone', pageId],
    queryFn: async () => unwrap(await webLocationsGone({ path: { id: pageId } })),
    enabled,
    retry: false,
  });
}

/** Refetches the location tree and server tallies after a route-level load error. */
export function useRetryLocations(refetchTallies: () => void): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: LOCATIONS_TREE_QUERY_KEY });
    refetchTallies();
  }, [queryClient, refetchTallies]);
}
