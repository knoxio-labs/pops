import { useParams } from 'react-router';

import { StayWorkspace } from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { sourceId } from './source-id';

/** Route adapter mounts the existing source-backed stay library with real owning identities. */
export function StayPage() {
  const params = useParams();
  const tripId = sourceId(params.tripId);
  const stayId = sourceId(params.stayId);
  return tripId === undefined || stayId === undefined ? (
    <ErrorState
      error={{
        code: 'trips.identity.invalid',
        message: 'Choose a valid trip and stay',
        retryable: false,
      }}
    />
  ) : (
    <StayWorkspace tripId={tripId} stayId={stayId} />
  );
}
