import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers.js';
import { webMovingGet } from '../inventory-api/index.js';

import type { UseQueryResult } from '@tanstack/react-query';

import type { InventoryApiError } from '../inventory-api-helpers.js';
import type { WebMovingGetData, WebMovingGetResponse } from '../inventory-api/types.gen.js';

/** The cache-key root for moving-day data and other inventory web data. */
export const WEB_MOVING_DAY_QUERY_KEY = ['inventory', 'web', 'moving-day'] as const;

/** The optional server filters for the moving-day aggregate. */
export interface MovingDayQuery {
  destinationField?: string;
  homeLocationId?: string;
}

type MovingDayRequestQuery = Omit<WebMovingGetData['query'], 'destinationField'> & {
  destinationField?: WebMovingGetData['query']['destinationField'];
};

function requestQuery(query: MovingDayQuery | undefined): MovingDayRequestQuery {
  const request: MovingDayRequestQuery = {};
  if (query?.destinationField !== undefined) request.destinationField = query.destinationField;
  if (query?.homeLocationId !== undefined) request.homeLocationId = query.homeLocationId;
  return request;
}

/** The moving-day page's server data; the Overview moving strip uses `useWebSummary` instead. */
export function useMovingDay(
  query?: MovingDayQuery
): UseQueryResult<WebMovingGetResponse, InventoryApiError> {
  const movingQuery = requestQuery(query);
  return useQuery<WebMovingGetResponse, InventoryApiError>({
    queryKey: [...WEB_MOVING_DAY_QUERY_KEY, movingQuery],
    queryFn: async () =>
      unwrap(
        await webMovingGet({
          // The generated OpenAPI type marks this server-defaulted field as required.
          query: movingQuery as WebMovingGetData['query'],
        })
      ),
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
}
