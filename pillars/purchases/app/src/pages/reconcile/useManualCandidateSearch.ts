import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { unwrap } from '../../purchases-api-helpers.js';
import { reconcileManualCandidates } from '../../purchases-api/index.js';

import type { ReconcileManualCandidatesResponses } from '../../purchases-api/types.gen.js';

/** A Finance transaction that can be linked manually to an unexplained charge. */
export type Candidate = NonNullable<ReconcileManualCandidatesResponses[200]>['items'][number];

interface CandidateSearch {
  search: string;
  setSearch: (value: string) => void;
  clear: () => void;
  results: Candidate[];
  isFetching: boolean;
  error: unknown;
}

const CANDIDATE_QUERY_KEY = ['purchases', 'reconcile', 'manual-candidates'] as const;

/** Debounces and fetches bounded Finance candidate results while the picker is open. */
export function useManualCandidateSearch(open: boolean): CandidateSearch {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const query = useQuery({
    queryKey: [...CANDIDATE_QUERY_KEY, debouncedSearch],
    enabled: open && debouncedSearch.length >= 2,
    queryFn: async () =>
      unwrap(
        await reconcileManualCandidates({
          query: { search: debouncedSearch, limit: 25 },
        })
      ).items,
  });

  return {
    search,
    setSearch,
    clear: () => {
      setSearch('');
      setDebouncedSearch('');
    },
    results: query.data ?? [],
    isFetching: query.isFetching,
    error: query.error,
  };
}
