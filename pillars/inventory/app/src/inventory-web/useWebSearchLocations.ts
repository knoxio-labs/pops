import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../inventory-api-helpers.js';
import * as inventoryApi from '../inventory-api/index.js';
import { flattenLocationTree } from './item-row-model.js';
import { LOCATION_TREE_QUERY_KEY } from './queryKeys.js';

import type { LocationModel } from '../foundation/model/model';

const EMPTY_LOCATION_NODES: readonly [] = [];

export interface WebSearchLocationState {
  readonly locations: readonly LocationModel[];
  readonly status: 'pending' | 'error' | 'success';
}

function queryStatus(query: {
  isPending: boolean;
  isError: boolean;
}): WebSearchLocationState['status'] {
  if (query.isPending) return 'pending';
  if (query.isError) return 'error';
  return 'success';
}

/** Loads the location tree used to resolve place hits from web search. */
export function useWebSearchLocations(): WebSearchLocationState {
  const query = useQuery({
    queryKey: LOCATION_TREE_QUERY_KEY,
    queryFn: async () => unwrap(await inventoryApi.locationsTree()),
    refetchOnWindowFocus: false,
  });
  const nodes = query.data?.data ?? EMPTY_LOCATION_NODES;
  const locations = useMemo(() => flattenLocationTree(nodes), [nodes]);

  return { locations, status: queryStatus(query) };
}
