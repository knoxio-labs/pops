import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ReviewPageCache } from './pageCache';

import type { ReviewGateway, ReviewPage } from './contracts';

function queryKey(batchId: string, page: ReviewPage) {
  return ['contacts-import-review', batchId, page];
}

/** Fetch bounded pages, retaining prior evidence only under the server's complete-snapshot proof. */
export function useReviewData(batchId: string, gateway: ReviewGateway) {
  const [page, setPage] = useState<ReviewPage>({ offset: 0 });
  const [cache] = useState(() => new ReviewPageCache());
  const client = useQueryClient();
  async function load(requested: ReviewPage) {
    const snapshot = await gateway.load(batchId, { ...requested, proposalRevision: cache.proof });
    return cache.accept(snapshot, requested.candidateRowId !== undefined);
  }
  const query = useQuery({
    queryKey: queryKey(batchId, page),
    queryFn: () => load(page),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  });
  async function refresh() {
    cache.clear();
    const next = { offset: 0 };
    const snapshot = await load(next);
    client.setQueryData(queryKey(batchId, next), snapshot);
    setPage(next);
  }
  return {
    ...query,
    refresh,
    pageRows: (offset: number) => setPage({ offset }),
    pageCandidates: (rowId: string, offset: number) =>
      setPage({ offset: page.offset, candidateRowId: rowId, candidateOffset: offset }),
  };
}
