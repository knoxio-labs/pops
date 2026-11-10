import { TripDocumentLinks } from './TripDocumentLinks';
import { TripDocumentUpload } from './TripDocumentUpload';

import type { ReactElement } from 'react';

import type { DocumentAssociationTarget, TripDocumentsWorkspaceProps } from './types';

/** Show trip-wide originals first and preserve each other explicit association target. */
export function TripDocumentsWorkspace({
  tripId,
  target,
  tripsClient,
  documentsClient,
}: TripDocumentsWorkspaceProps): ReactElement {
  const activeTarget = target ?? tripTarget(tripId);
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Documents</h1>
      </header>
      <TripDocumentUpload
        tripId={tripId}
        target={activeTarget}
        tripsClient={tripsClient}
        documentsClient={documentsClient}
      />
      <TripDocumentLinks
        tripId={tripId}
        tripsClient={tripsClient}
        documentsClient={documentsClient}
      />
    </main>
  );
}

function tripTarget(tripId: number): DocumentAssociationTarget {
  return { kind: 'trip', id: tripId };
}
