import { AlertCircle, PackageSearch } from 'lucide-react';
import { Link } from 'react-router';

import { Alert, AlertDescription, AlertTitle, Button, Skeleton } from '@pops/ui';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : 'The inventory service did not answer.';
}

/** Renders the item-shaped loading state before the aggregate is available. */
export function ItemDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading item" className="flex max-w-5xl flex-col gap-4">
      <Skeleton className="h-4 w-40" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-3 w-80" />
        </div>
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="flex gap-4 rounded-xl border bg-card p-4">
        <Skeleton className="aspect-4/3 w-48 rounded-lg" />
        <div className="grid flex-1 grid-cols-3 content-start gap-4">
          {['one', 'two', 'three', 'four', 'five', 'six'].map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {['one', 'two', 'three', 'four'].map((key) => (
          <div key={key} className="flex h-11 items-center gap-3 px-4">
            <Skeleton className="size-4" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-56" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Renders a not-found or request-failure state with a route-compatible return action. */
export function ItemDetailProblem({
  variant,
  error,
  onRetry,
}: {
  variant: 'error' | 'not-found';
  error?: unknown;
  onRetry?: () => void;
}) {
  const notFound = variant === 'not-found';
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        {notFound ? (
          <PackageSearch className="size-6 text-muted-foreground" aria-hidden />
        ) : (
          <AlertCircle className="size-6 text-muted-foreground" aria-hidden />
        )}
      </span>
      <Alert variant={notFound ? 'destructive' : 'default'} className="max-w-xl text-left">
        <AlertTitle>{notFound ? 'Item not found' : 'Error'}</AlertTitle>
        <AlertDescription>
          {notFound ? "This item doesn't exist." : errorMessage(error)}
        </AlertDescription>
      </Alert>
      <div className="flex gap-2">
        {!notFound && onRetry ? <Button onClick={onRetry}>Retry</Button> : null}
        <Button asChild variant={notFound || !onRetry ? 'default' : 'ghost'}>
          <Link to="/inventory/items">Back to inventory</Link>
        </Button>
      </div>
    </div>
  );
}
