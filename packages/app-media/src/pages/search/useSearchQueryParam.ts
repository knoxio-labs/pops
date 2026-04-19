import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useDebouncedValue } from '@pops/ui';

/**
 * Two-way binding between a debounced search input and the `?q=` URL param.
 * Returns the current input value, a setter, and the debounced query.
 */
export function useSearchQueryParam(debounceMs = 300) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebouncedValue(query, debounceMs);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedQuery) {
          next.set('q', debouncedQuery);
        } else {
          next.delete('q');
        }
        return next;
      },
      { replace: true }
    );
  }, [debouncedQuery, setSearchParams]);

  return { query, setQuery, debouncedQuery };
}
