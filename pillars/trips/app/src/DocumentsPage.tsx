import { useParams } from 'react-router';

import { DocumentUploadProvider, TripDocumentsWorkspace } from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { sourceId } from './source-id';

import type { RemotePageHostProps } from '@pops/pillar-sdk';

/** Mount the shared Documents owner picker and typed association workspace for one real trip. */
export function DocumentsPage(props: RemotePageHostProps = {}) {
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
    <DocumentUploadProvider host={props.documentUploads} tripId={tripId}>
      <TripDocumentsWorkspace tripId={tripId} />
    </DocumentUploadProvider>
  );
}
