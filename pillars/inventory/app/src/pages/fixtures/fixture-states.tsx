import { AlertCircle, Cable, Plug, SearchX } from 'lucide-react';
import { Link } from 'react-router';

import { Alert, AlertDescription, AlertTitle, Button, EmptyState, Skeleton } from '@pops/ui';

import { ListBody, ListError, ListSkeleton } from '../../foundation/list-page/list-states.js';

import type { ReactElement } from 'react';

/** Renders the fixture list while its first server page is loading. */
export function FixturesLoading(): ReactElement {
  return <ListSkeleton label="Loading fixtures" />;
}

/** Renders a retryable fixture list request failure. */
export function FixturesError({ onRetry }: { onRetry: () => void }): ReactElement {
  return <ListError noun="fixtures" onRetry={onRetry} />;
}

/** Renders the first-use fixture prompt. */
export function FixturesEmpty({ onNew }: { onNew: () => void }): ReactElement {
  return (
    <ListBody className="flex items-center justify-center">
      <EmptyState
        icon={Plug}
        title="No fixtures recorded"
        description="Add the outlets, ports and light fittings things are wired to, so a trace can end somewhere real."
        action={<Button onClick={onNew}>New fixture</Button>}
      />
    </ListBody>
  );
}

/** Renders the no-results state for a narrowed fixture query. */
export function FixturesEmptyFiltered({ onClear }: { onClear: () => void }): ReactElement {
  return (
    <ListBody className="flex items-center justify-center">
      <EmptyState
        icon={SearchX}
        title="No fixtures match these filters"
        description="Try a different fixture name or kind, or clear the filters to see everything."
        action={
          <Button variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    </ListBody>
  );
}

/** Renders the fixture detail skeleton while fixture facts and wired items load. */
export function FixtureDetailLoading(): ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading fixture"
      className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row"
    >
      <div className="flex w-full shrink-0 flex-col gap-4 rounded-xl border bg-card p-4 lg:w-72">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="min-h-0 flex-1 rounded-xl border bg-card p-4">
        <Skeleton className="mb-4 h-4 w-48" />
        <div className="divide-y">
          {['one', 'two', 'three', 'four'].map((key) => (
            <div key={key} className="flex h-11 items-center gap-3">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Renders a missing fixture route or a retryable fixture detail failure. */
export function FixtureDetailProblem({
  variant,
  error,
  onRetry,
}: {
  variant: 'error' | 'not-found';
  error?: unknown;
  onRetry?: () => void;
}): ReactElement {
  const notFound = variant === 'not-found';
  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : 'The inventory service did not answer.';
  return (
    <ListBody className="flex min-h-80 items-center justify-center gap-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        {notFound ? (
          <Cable className="size-6 text-muted-foreground" aria-hidden />
        ) : (
          <AlertCircle className="size-6 text-muted-foreground" aria-hidden />
        )}
      </span>
      <Alert variant={notFound ? 'destructive' : 'default'} className="max-w-xl text-left">
        <AlertTitle>{notFound ? 'Fixture not found' : 'Fixture did not load'}</AlertTitle>
        <AlertDescription>{notFound ? "This fixture doesn't exist." : message}</AlertDescription>
      </Alert>
      <div className="flex gap-2">
        {!notFound && onRetry ? <Button onClick={onRetry}>Retry</Button> : null}
        <Button asChild variant={notFound || !onRetry ? 'default' : 'ghost'}>
          <Link to="/inventory/connections/fixtures">Back to fixtures</Link>
        </Button>
      </div>
    </ListBody>
  );
}
