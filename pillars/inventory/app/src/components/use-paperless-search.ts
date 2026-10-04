import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers.js';
import { paperlessSearch } from '../inventory-api/index.js';

/** Searches Paperless when the dialog is open and the query has at least two characters. */
export function usePaperlessSearch(open: boolean, search: string) {
  const searchInput = { query: search };
  return useQuery({
    queryKey: ['inventory', 'paperless', 'search', searchInput],
    queryFn: async () => unwrap(await paperlessSearch({ query: searchInput })),
    enabled: open && search.length >= 2,
  });
}
