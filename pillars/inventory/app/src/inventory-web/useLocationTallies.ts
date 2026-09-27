import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { unwrap } from '../inventory-api-helpers.js';
import { webLocationsTallies } from '../inventory-api/index.js';

import type { WebLocationsTalliesResponse } from '../inventory-api/types.gen.js';

/** The shared cache key for the server's per-location tally response. */
export const LOCATION_TALLIES_QUERY_KEY = ['inventory', 'web', 'location-tallies'] as const;

/** The five active-content counts served for one location. */
export type PlaceTally = WebLocationsTalliesResponse['tallies'][string];

/** A zero-valued fallback for a location absent from the server response. */
export const EMPTY_TALLY: PlaceTally = {
  boxesHere: 0,
  inBoxes: 0,
  itemsHere: 0,
  places: 0,
  total: 0,
};

/** Per-location tally data and query state for the Locations surfaces. */
export interface LocationTallies {
  tallyOf: (id: string) => PlaceTally;
  status: 'pending' | 'error' | 'success';
  refetch: () => void;
}

/** Reads all location tallies once and returns zeroes for unknown locations. */
export function useLocationTallies(): LocationTallies {
  const query = useQuery({
    queryKey: LOCATION_TALLIES_QUERY_KEY,
    queryFn: async () => unwrap(await webLocationsTallies()),
  });

  const tallyOf = useCallback(
    (id: string): PlaceTally => query.data?.tallies[id] ?? EMPTY_TALLY,
    [query.data]
  );
  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);

  return useMemo(
    () => ({ tallyOf, status: query.status, refetch }),
    [query.status, refetch, tallyOf]
  );
}
