import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers.js';
import { paperlessStatus } from '../inventory-api/index.js';

import type { UseQueryResult } from '@tanstack/react-query';

import type { InventoryApiError } from '../inventory-api-helpers.js';
import type { PaperlessStatusResponse } from '../inventory-api/types.gen.js';

/** The shared cache key for Paperless availability and connection details. */
export const PAPERLESS_STATUS_QUERY_KEY = ['inventory', 'paperless', 'status'] as const;

/** `PaperlessStatusResponse['data']`, the selected status payload. */
export type PaperlessStatusResult = PaperlessStatusResponse['data'];

/** Reads Paperless through the shared envelope cache used by item documents. */
export function usePaperlessStatus(): UseQueryResult<PaperlessStatusResult, InventoryApiError> {
  return useQuery<PaperlessStatusResponse, InventoryApiError, PaperlessStatusResult>({
    queryKey: PAPERLESS_STATUS_QUERY_KEY,
    queryFn: async () => unwrap(await paperlessStatus()),
    select: (envelope) => envelope.data,
    refetchOnWindowFocus: false,
  });
}

/** The Paperless fields required by report receipt links and outage banners. */
export interface PaperlessState {
  available: boolean;
  configured: boolean;
  baseUrl: string | null;
}

/** Returns the report-facing Paperless state, or null before its first answer. */
export function usePaperlessState(): PaperlessState | null {
  const { data } = usePaperlessStatus();
  if (data === undefined) return null;
  return {
    available: data.available,
    configured: data.configured,
    baseUrl: data.baseUrl,
  };
}
