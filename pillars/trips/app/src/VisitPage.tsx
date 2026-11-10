import { useNavigate, useParams } from 'react-router';

import { VisitWorkspace } from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { sourceId } from './source-id';

/** Mount the approved visit workspace using literal owning identities and source routes. */
export function VisitPage() {
  const params = useParams();
  const navigate = useNavigate();
  const tripId = sourceId(params.tripId);
  const visitId = sourceId(params.visitId);
  return tripId === undefined || visitId === undefined ? (
    <ErrorState
      error={{
        code: 'trips.identity.invalid',
        message: 'Choose a valid trip and visit',
        retryable: false,
      }}
    />
  ) : (
    <VisitWorkspace
      tripId={tripId}
      visitId={visitId}
      onViewVisit={(id) => void navigate(`/trips/${tripId}/visits/${id}`)}
      onViewStay={(id) => void navigate(`/trips/${tripId}/stays/${id}`)}
      onViewEvent={(id) => void navigate(`/trips/${tripId}/events/${id}`)}
    />
  );
}
