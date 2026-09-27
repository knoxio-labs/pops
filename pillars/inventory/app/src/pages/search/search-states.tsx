import { SearchX } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Button, EmptyState, Skeleton } from '@pops/ui';

/** Renders placeholders while the debounced search request is pending. */
export function SearchLoadingState() {
  return (
    <div
      role="status"
      aria-label="Loading search results"
      aria-busy
      className="space-y-2 rounded-xl border bg-card p-3"
    >
      {['one', 'two', 'three', 'four', 'five', 'six', 'seven'].map((key) => (
        <div key={key} className="flex h-16 items-center gap-3 border-b px-2 last:border-0">
          <Skeleton className="size-10 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Renders a retryable search request failure without claiming there are no results. */
export function SearchErrorState({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Alert variant="destructive" className="m-1">
      <AlertTitle>Search did not load</AlertTitle>
      <AlertDescription>The search service did not answer. Nothing was changed.</AlertDescription>
      <Button variant="outline" className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </Alert>
  );
}

/** Renders a settled no-results state with filter and scope escape hatches. */
export function SearchNoResultsState({
  scope,
  hasFilters,
  otherCount,
  onClearFilters,
  onSwitchScope,
}: {
  readonly scope: 'inventory' | 'purchases';
  readonly hasFilters: boolean;
  readonly otherCount: number;
  readonly onClearFilters: () => void;
  readonly onSwitchScope: () => void;
}) {
  const otherScope = scope === 'inventory' ? 'Purchases' : 'Inventory';
  const description = hasFilters
    ? 'Try clearing the type or placement filters.'
    : `Try a different name, code, note or ${scope === 'inventory' ? 'place' : 'merchant'}.`;
  return (
    <div className="flex min-h-72 items-center justify-center rounded-xl border bg-card">
      <EmptyState
        icon={SearchX}
        title={scope === 'inventory' ? 'No inventory matches' : 'No purchases match'}
        description={description}
        action={
          <span className="flex flex-wrap justify-center gap-2">
            {hasFilters ? (
              <Button variant="outline" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : null}
            {otherCount > 0 ? (
              <Button variant="outline" onClick={onSwitchScope}>
                Search {otherScope} ({otherCount})
              </Button>
            ) : null}
          </span>
        }
      />
    </div>
  );
}
