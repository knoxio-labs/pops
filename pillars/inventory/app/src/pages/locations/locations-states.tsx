import { FolderPlus, House } from 'lucide-react';

import { Button, EmptyState, Skeleton } from '@pops/ui';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { LoadError } from '../location-page/location-page-state.js';

import type { ReactElement } from 'react';

/** Renders the tree and preview loading geometry before either query is ready. */
export function LocationsLoading(): ReactElement {
  return (
    <div
      aria-busy="true"
      aria-label="Loading places"
      className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]"
    >
      <div className="space-y-2 rounded-xl border bg-card p-3">
        <Skeleton className="h-9 w-full" />
        {['one', 'two', 'three', 'four', 'five', 'six'].map((row, index) => (
          <Skeleton key={row} className={index % 2 === 0 ? 'h-6 w-3/4' : 'ml-6 h-6 w-2/3'} />
        ))}
      </div>
      <div className="hidden space-y-3 rounded-xl border bg-card p-4 lg:block">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-48" />
        {['one', 'two', 'three', 'four', 'five'].map((row) => (
          <Skeleton key={row} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Props for the empty Locations state. */
export interface LocationsEmptyProps {
  readonly offline: boolean;
  readonly onNewPlace: () => void;
}

/** Renders the first-place prompt and keeps creation disabled offline. */
export function LocationsEmpty({ offline, onNewPlace }: LocationsEmptyProps): ReactElement {
  const button = (
    <Button
      prefix={<FolderPlus className="size-4" aria-hidden />}
      disabled={offline}
      aria-disabled={offline || undefined}
      onClick={offline ? undefined : onNewPlace}
    >
      New place
    </Button>
  );
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
      <EmptyState
        icon={House}
        title="No places yet"
        description="Start with the property, such as your house, then add rooms and furniture inside it. Items are stored in places."
        action={
          offline ? (
            <HintTooltip label="New place" disabledReason={OFFLINE_REASON}>
              {button}
            </HintTooltip>
          ) : (
            button
          )
        }
      />
    </div>
  );
}

/** Renders a retryable error for the Locations tree or tally query. */
export function LocationsError({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <LoadError
      title="Places did not load."
      detail="The inventory service did not answer. Nothing was changed."
      onRetry={onRetry}
    />
  );
}
