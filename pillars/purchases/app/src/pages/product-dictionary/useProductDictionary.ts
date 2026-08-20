import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../purchases-api-helpers.js';
import { productList } from '../../purchases-api/index.js';

import type { DictionaryProduct } from './types.js';

/**
 * The key every dictionary read shares, so a correction can invalidate the
 * listing without knowing what the filter bar currently says.
 */
export const PRODUCT_DICTIONARY_QUERY_KEY = ['purchases', 'products'] as const;

export interface ProductDictionaryResult {
  products: DictionaryProduct[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * The dictionary, whole.
 *
 * No filters travel and no page size does either. `GET /products` carries no
 * `limit` on purpose — a truncated dictionary is indistinguishable from one
 * where the missing wordings simply have no entry, and those are the two
 * states a reader here most needs to tell apart — so the read is the whole
 * table and the filter bar narrows what is already in hand.
 */
export function useProductDictionary(): ProductDictionaryResult {
  const query = useQuery({
    queryKey: PRODUCT_DICTIONARY_QUERY_KEY,
    queryFn: async () => unwrap(await productList({ query: {} })),
  });

  return {
    products: query.data?.products ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
