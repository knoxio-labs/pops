import { useQuery } from '@tanstack/react-query';

import { PurchasesApiError, unwrap } from '../purchases-api-helpers.js';
import { searchSearch } from '../purchases-api/index.js';
import { purchaseHits } from './purchase-model.js';

import type { SearchSearchResponse } from '../purchases-api/types.gen.js';
import type { PurchaseHit } from './purchase-model.js';

/** The cache-key root for inventory's purchases search scope. */
export const PURCHASES_SEARCH_QUERY_KEY = ['inventory', 'purchases', 'search'] as const;

/** The state returned by {@link usePurchasesSearch}. */
export interface PurchasesSearchState {
  hits: PurchaseHit[];
  status: 'idle' | 'pending' | 'error' | 'success';
  error: PurchasesApiError | null;
}

/** Search the purchases pillar without adding inventory-owned filters. */
export function usePurchasesSearch(q: string): PurchasesSearchState {
  const trimmed = q.trim();
  const query = useQuery<SearchSearchResponse, PurchasesApiError>({
    queryKey: [...PURCHASES_SEARCH_QUERY_KEY, trimmed] as const,
    queryFn: async () =>
      unwrap(
        await searchSearch({
          body: { query: { text: trimmed } },
        })
      ),
    enabled: trimmed.length > 0,
  });

  return {
    hits: query.data === undefined ? [] : purchaseHits(query.data.hits),
    status: trimmed.length === 0 ? 'idle' : query.status,
    error: query.error instanceof PurchasesApiError ? query.error : null,
  };
}
