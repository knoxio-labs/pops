import { Skeleton } from '@pops/ui';

import { LoadError } from '../location-page/location-page-state.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';

/** Renders the selected-place content loading, error, or success state. */
export function ContentState({
  place,
  status,
  onRetry,
  children,
}: {
  place: LocationModel;
  status: 'pending' | 'error' | 'success';
  onRetry: () => void;
  children: ReactElement;
}): ReactElement {
  if (status === 'pending') {
    return (
      <div aria-busy="true" aria-label={`Loading ${place.name}`} className="space-y-2">
        {['one', 'two', 'three', 'four', 'five'].map((row) => (
          <Skeleton key={row} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <LoadError
        title={`${place.name} did not load`}
        detail="The inventory service did not answer. Nothing was changed."
        onRetry={onRetry}
      />
    );
  }
  return children;
}
