import type { Client as DocumentsClient } from '../documents-api/client';
import type {
  PaperlessGetResponses,
  PaperlessSearchResponses,
  PaperlessStatusResponses,
  PaperlessTaskResponses,
} from '../documents-api/types.gen';
import type { Client as TripsClient } from '../trips-api/client';
import type { DocumentAssociationsListResponses } from '../trips-api/types.gen';

/** A Documents original explicitly associated with one Trips-owned target. */
export type TripDocumentAssociation =
  DocumentAssociationsListResponses[200]['associations'][number];
/** Canonical metadata resolved by the Documents owner. */
export type PaperlessDocument = PaperlessGetResponses[200]['data'];
/** Search result shape from the Documents owner. */
export type PaperlessSearchDocument = PaperlessSearchResponses[200]['data'][number];
/** Owner upload policy used to validate a file before sending it. */
export type PaperlessUploadPolicy = Pick<
  PaperlessStatusResponses[200]['data'],
  'configured' | 'available' | 'maxUploadBytes' | 'allowedMimeTypes'
>;
/** Poll result from the owner for an accepted upload task. */
export type PaperlessTask = PaperlessTaskResponses[200]['data'];
/** Explicit trip and optional source target, with host-provided authenticated owner transports. */
export interface TripDocumentsWorkspaceProps {
  tripId: number;
  target?: DocumentAssociationTarget;
  tripsClient?: TripsClient;
  documentsClient?: DocumentsClient;
}
/** A selected target whose identity is owned by Trips, never by Documents. */
export interface DocumentAssociationTarget {
  kind: TripDocumentAssociation['targetKind'];
  id: number;
}
