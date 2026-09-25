/**
 * The Locations page before it has a tree to show: loading (one skeleton in
 * the page's shape), no places yet (the one action that fixes it), and a
 * failed load (what failed, and Retry).
 */
import { FolderPlus, House, MapPin } from 'lucide-react';

import { Button, EmptyState, Skeleton } from '@pops/ui';

import { StateBanner } from '../foundation';
import { FitPage } from './fit-page';

const TREE_ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'];
const ITEM_ROWS = ['i1', 'i2', 'i3', 'i4', 'i5'];

function NewPlaceButton() {
  return <Button prefix={<FolderPlus className="size-4" aria-hidden />}>New place</Button>;
}

/** Loading: the tree and the panel as skeletons. */
export function LocationsLoading() {
  return (
    <FitPage
      title="Locations"
      icon={MapPin}
      description="Loading places"
      actions={<NewPlaceButton />}
    >
      <div
        aria-busy="true"
        aria-label="Loading places"
        className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]"
      >
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <Skeleton className="h-9 w-full" />
          {TREE_ROWS.map((row, index) => (
            <Skeleton key={row} className={index % 3 === 0 ? 'h-6 w-3/4' : 'ml-6 h-6 w-2/3'} />
          ))}
        </div>
        <div className="hidden space-y-3 rounded-xl border bg-card p-4 lg:block">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
          {ITEM_ROWS.map((row) => (
            <Skeleton key={row} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </FitPage>
  );
}

/** No places at all yet. */
export function LocationsEmpty() {
  return (
    <FitPage title="Locations" icon={MapPin}>
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
        <EmptyState
          icon={House}
          title="No places yet"
          description="Start with the property, such as your house, then add rooms and furniture inside it. Items are stored in places."
          action={<NewPlaceButton />}
        />
      </div>
    </FitPage>
  );
}

/** The tree failed to load. */
export function LocationsError() {
  return (
    <FitPage title="Locations" icon={MapPin}>
      <StateBanner
        kind="error"
        title="Places did not load."
        detail="The inventory service did not answer. Nothing was changed."
        actionLabel="Retry"
      />
    </FitPage>
  );
}
