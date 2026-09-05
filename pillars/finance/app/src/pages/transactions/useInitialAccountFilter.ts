import { useMemo } from 'react';
import { useSearchParams } from 'react-router';

import type { ColumnFiltersState } from '@tanstack/react-table';

/**
 * A link into the transactions page can pre-scope it to one account (the
 * account detail page's "View all" does) via `?account=<id>`. `DataTable`'s
 * `initialColumnFilters` only seeds the table's own uncontrolled filter
 * state on mount, so a later change to this value has no further effect —
 * matching the fact that nothing in this page updates the URL once loaded.
 */
export function useInitialAccountFilter(): ColumnFiltersState {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('account');
  return useMemo(() => (accountId ? [{ id: 'accountId', value: accountId }] : []), [accountId]);
}
