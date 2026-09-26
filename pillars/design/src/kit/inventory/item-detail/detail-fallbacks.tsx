/**
 * An item page before it has an item: one skeleton in the page's own shape
 * (never a skeleton per section, POPS-3617), a load failure with Retry, and
 * an item that no longer exists.
 */
import { CircleAlert } from 'lucide-react';

import { Button, Skeleton, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../foundation';
import { PAGE_HEIGHT } from './section-parts';

const FACTS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];
const ROWS = ['r1', 'r2', 'r3', 'r4'];

/** The loading page. */
export function ItemDetailSkeleton() {
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

/** The page when the item could not be read, or no longer exists. */
export function ItemDetailProblem({ variant }: { variant: 'error' | 'not-found' }) {
  const failed = variant === 'error';
  const Icon = failed ? CircleAlert : INVENTORY_ICONS.item;
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 text-center', PAGE_HEIGHT)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </span>
      <div className="max-w-sm space-y-1">
        <h1 className="text-lg font-semibold">
          {failed ? 'This item could not be loaded' : 'This item no longer exists'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {failed
            ? 'The inventory service did not answer. Nothing was changed.'
            : 'It was deleted on another device, or the link points at nothing. Its code may belong to something else now.'}
        </p>
      </div>
      <div className="flex gap-2">
        {failed ? <Button>Retry</Button> : null}
        <Button variant={failed ? 'ghost' : 'default'}>Back to Items</Button>
      </div>
    </div>
  );
}
