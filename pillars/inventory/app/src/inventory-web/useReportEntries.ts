import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers.js';
import { webReportsEntries } from '../inventory-api/index.js';

import type { UseQueryResult } from '@tanstack/react-query';

import type { InventoryApiError } from '../inventory-api-helpers.js';
import type { WebReportsEntriesResponse } from '../inventory-api/types.gen.js';

/** The cache key for the active entries consumed by the Reports tabs. */
export const REPORT_ENTRIES_QUERY_KEY = ['inventory', 'web', 'reports', 'entries'] as const;

/** One active item and its report-ready provenance and effective placement. */
export type ReportEntry = WebReportsEntriesResponse['entries'][number];

/** Reads active report entries from the web reports endpoint. */
export function useReportEntries(): UseQueryResult<ReportEntry[], InventoryApiError> {
  return useQuery<ReportEntry[], InventoryApiError>({
    queryKey: REPORT_ENTRIES_QUERY_KEY,
    queryFn: async () => unwrap(await webReportsEntries()).entries,
    refetchOnWindowFocus: false,
  });
}
