import { CircleAlert, CloudOff } from 'lucide-react';
import { Link } from 'react-router';

import { Button, Skeleton, cn } from '@pops/ui';

import { OFFLINE_TITLE, StateBanner } from '../feedback/state-banner.js';
import { INVENTORY_ICONS } from '../model/icons';
import { PAGE_HEIGHT } from './section-parts';

import type { ReactElement } from 'react';

const FACTS = ['fact-1', 'fact-2', 'fact-3', 'fact-4', 'fact-5', 'fact-6'];
const ROWS = ['row-1', 'row-2', 'row-3', 'row-4'];

/** Renders one item-shaped loading state for the whole page. */
export function ItemDetailSkeleton(): ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading item"
      className={cn('flex max-w-3xl flex-col gap-4', PAGE_HEIGHT)}
    >
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
          {FACTS.map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {ROWS.map((key) => (
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

/** Renders a load failure or a missing-item state with a return action. */
export function ItemDetailProblem({
  variant,
  onRetry,
}: {
  variant: 'error' | 'not-found' | 'unavailable';
  onRetry?: () => void;
}): ReactElement {
  const failed = variant !== 'not-found';
  const unavailable = variant === 'unavailable';
  let Icon = INVENTORY_ICONS.item;
  if (unavailable) Icon = CloudOff;
  else if (failed) Icon = CircleAlert;
  let heading = 'This item no longer exists';
  if (unavailable) heading = 'This item is unavailable';
  else if (failed) heading = 'This item could not be loaded';
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 text-center', PAGE_HEIGHT)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </span>
      <div className="max-w-sm space-y-1">
        <h1 className="text-lg font-semibold">{heading}</h1>
        {failed ? (
          <StateBanner
            kind={unavailable ? 'offline' : 'error'}
            title={
              unavailable
                ? OFFLINE_TITLE
                : 'The inventory service did not answer. Nothing was changed.'
            }
            detail={unavailable ? 'Retry when the connection returns.' : undefined}
            actionLabel={onRetry === undefined ? undefined : 'Retry'}
            onAction={onRetry}
            className="text-left"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            It was deleted on another device, or the link points at nothing. Its code may belong to
            something else now.
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button asChild variant={failed ? 'ghost' : 'default'}>
          <Link to="/inventory/items">Back to Items</Link>
        </Button>
      </div>
    </div>
  );
}
