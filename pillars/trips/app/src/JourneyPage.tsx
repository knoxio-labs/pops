import { useNavigate, useParams } from 'react-router';

import { DocumentUploadProvider, JourneyWorkspace } from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { sourceId } from './source-id';

import type { RemotePageHostProps } from '@pops/pillar-sdk';

/** Mount a real trip-owned journey source without binding fixture or inferred identities. */
export function JourneyPage({ documentUploads }: RemotePageHostProps) {
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
    <DocumentUploadProvider host={documentUploads} tripId={tripId}>
      <JourneyWorkspace
        tripId={tripId}
        journeyId={journeyId}
        onViewJourney={(id) => {
          void navigate(`/trips/${tripId}/journeys/${id}`, { replace: true });
        }}
      />
    </DocumentUploadProvider>
  );
}
