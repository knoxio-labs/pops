import { useParams } from 'react-router';

import { TripDocumentsWorkspace } from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { sourceId } from './source-id';

/** Mount the shared Documents owner picker and typed association workspace for one real trip. */
export function DocumentsPage() {
  const tripId = sourceId(useParams().tripId);
  return tripId === undefined ? (
    <ErrorState
      error={{
        code: 'trips.identity.invalid',
        message: 'Choose a valid trip',
        retryable: false,
      }}
    />
  ) : (
    <TripDocumentsWorkspace tripId={tripId} />
  );
}
