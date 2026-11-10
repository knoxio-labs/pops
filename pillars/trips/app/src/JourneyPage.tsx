import { useNavigate, useParams } from 'react-router';

import { JourneyWorkspace } from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { sourceId } from './source-id';

/** Mount a real trip-owned journey source without binding fixture or inferred identities. */
export function JourneyPage() {
  const navigate = useNavigate();
  const params = useParams();
  const tripId = sourceId(params.tripId);
  const journeyId = sourceId(params.journeyId);
  return tripId === undefined || journeyId === undefined ? (
    <ErrorState
      error={{
        code: 'trips.identity.invalid',
        message: 'Choose a valid trip and journey',
        retryable: false,
      }}
    />
  ) : (
    <JourneyWorkspace
      tripId={tripId}
      journeyId={journeyId}
      onViewJourney={(id) => {
        void navigate(`/trips/${tripId}/journeys/${id}`, { replace: true });
      }}
    />
  );
}
