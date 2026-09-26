import { Link } from 'react-router';

import { Button, Skeleton } from '@pops/ui';

import type { ReactElement } from 'react';

/** The loading placeholder for the new item form. */
export function FormSkeleton(): ReactElement {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Skeleton className="h-112" />
        <Skeleton className="h-112" />
      </div>
    </div>
  );
}

/** The retryable source-loading error for the form. */
export function FormLoadError({
  title,
  subject,
  onRetry,
}: {
  title: string;
  subject: string;
  onRetry: () => void;
}): ReactElement {
  return (
    <div role="alert" className="mx-auto max-w-xl space-y-4 p-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">Could not load {subject}.</p>
      <div className="flex justify-center gap-2">
        <Button type="button" onClick={onRetry}>
          Try again
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/inventory/items">Back to items</Link>
        </Button>
      </div>
    </div>
  );
}
