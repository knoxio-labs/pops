import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers.js';
import { webReportsValues } from '../inventory-api/index.js';

import type { UseQueryResult } from '@tanstack/react-query';

import type { InventoryApiError } from '../inventory-api-helpers.js';
import type { WebReportsValuesResponse } from '../inventory-api/types.gen.js';

/** The server dimension used to group value-report entries. */
export type ValueReportBy = 'room' | 'type';

/** The stored-value basis used by the report. */
export type ValueReportBasis = 'replacement' | 'purchase';

/** The server-computed value report returned to report screens. */
export type ValueReport = WebReportsValuesResponse;

/** Builds the cache key for one server-grouped value report. */
export function valueReportQueryKey(
  by: ValueReportBy,
  basis: ValueReportBasis
): readonly ['inventory', 'web', 'reports', 'values', ValueReportBy, ValueReportBasis] {
  return ['inventory', 'web', 'reports', 'values', by, basis];
}

/** Reads server-computed inventory values without changing group or unvalued-entry order. */
export function useValueReport(
  by: ValueReportBy,
  basis: ValueReportBasis
): UseQueryResult<ValueReport, InventoryApiError> {
  return useQuery<ValueReport, InventoryApiError>({
    queryKey: valueReportQueryKey(by, basis),
    queryFn: async () =>
      unwrap(
        await webReportsValues({
          query: { by, basis },
        })
      ),
    refetchOnWindowFocus: false,
  });
}
