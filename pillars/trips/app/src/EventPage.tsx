import { useParams } from 'react-router';

import { EventWorkspace } from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { sourceId } from './source-id';

/** Bind the source-backed event workspace to its validated owning route identities. */
export function EventPage() {
  const params = useParams();
  const tripId = sourceId(params.tripId);
  const eventId = sourceId(params.eventId);
  return tripId === undefined || eventId === undefined ? (
    <ErrorState
      error={{
        code: 'trips.identity.invalid',
        message: 'Choose a valid trip and event',
        retryable: false,
      }}
    />
  ) : (
    <EventWorkspace tripId={tripId} eventId={eventId} />
  );
}
