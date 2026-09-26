import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers.js';
import { webSummaryGet } from '../inventory-api/index.js';

import type { UseQueryResult } from '@tanstack/react-query';

import type { InventoryApiError } from '../inventory-api-helpers.js';
import type { WebSummaryGetResponse } from '../inventory-api/types.gen.js';

/** The cache key shared by Overview and Containers summary consumers. */
export const WEB_SUMMARY_QUERY_KEY = ['inventory', 'web', 'summary'] as const;

/** Reads overview, container-segment, packing, and moving counts from the web summary endpoint. */
export function useWebSummary(): UseQueryResult<WebSummaryGetResponse, InventoryApiError> {
  return useQuery<WebSummaryGetResponse, InventoryApiError>({
    queryKey: WEB_SUMMARY_QUERY_KEY,
    queryFn: async () => unwrap(await webSummaryGet()),
    refetchOnWindowFocus: false,
  });
}
