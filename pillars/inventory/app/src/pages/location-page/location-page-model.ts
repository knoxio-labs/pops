import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { unwrap } from '../../inventory-api-helpers.js';
import { locationsTree } from '../../inventory-api/index.js';
import { flattenLocationTree } from '../../inventory-web/item-row-model.js';
import { LOCATIONS_TREE_QUERY_KEY } from '../../inventory-web/queryKeys.js';

import type { LocationModel } from '../../foundation/model/model.js';

/** The location tree flattened for page lookups, with its request state. */
export interface LocationModels {
  readonly locations: LocationModel[];
  readonly status: 'pending' | 'error' | 'success';
  readonly error: unknown;
  readonly refetch: () => void;
}

/** Loads the server location tree used by the detail page and its breadcrumbs. */
export function useLocationModels(): LocationModels {
  const query = useQuery({
    queryKey: LOCATIONS_TREE_QUERY_KEY,
    queryFn: async () => unwrap(await locationsTree()),
  });
  const locations = useMemo(
    () => (query.data === undefined ? [] : flattenLocationTree(query.data.data)),
    [query.data]
  );
  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);
  return { locations, status: query.status, error: query.error, refetch };
}
