import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

import type { useWebSearch } from '../../inventory-web/useWebSearch.js';

type WebSearch = ReturnType<typeof useWebSearch>;

/** Renders the pending and retryable error states for reference search. */
export function ReferenceSearchStatus({
  search,
}: {
  readonly search: WebSearch;
}): ReactElement | null {
  if (search.status === 'pending') {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Searching…
      </p>
    );
  }
  if (search.status !== 'error') return null;
  return (
    <div role="alert" className="flex items-center justify-between gap-2 text-sm text-destructive">
      <span>{search.error?.message ?? 'Reference search failed.'}</span>
      <Button type="button" variant="outline" size="sm" onClick={() => void search.refetch()}>
        Try again
      </Button>
    </div>
  );
}
