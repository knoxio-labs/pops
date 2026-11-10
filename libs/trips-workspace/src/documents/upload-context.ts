import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { DocumentAssociationTarget } from './types';
import type { UploadFields } from './useUploadFields';

export { TripDocumentUploadContextError } from './upload-context-error';

/** Validate a retained context before a local recovery action, preserving its receipt on rejection. */
export function runUploadContextAction(
  fields: UploadFields,
  beforeRequest: (() => void) | undefined,
  action: () => void
): void {
  try {
    beforeRequest?.();
    action();
  } catch (error) {
    if (!(error instanceof TripDocumentUploadContextError)) throw error;
    fields.setUploadError(error.message);
  }
}

/** Identify an upload context by its owner transports and explicit Trips target. */
export function uploadSessionKey(
  tripId: number,
  target: DocumentAssociationTarget,
  tripsClient: TripsClient | undefined,
  documentsClient: DocumentsClient | undefined
): string {
  return [
    (tripsClient ?? defaultTripsClient).getConfig().baseUrl ?? '',
    (documentsClient ?? defaultDocumentsClient).getConfig().baseUrl ?? '',
    String(tripId),
    target.kind,
    String(target.id),
  ].join(':');
}
import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { client as defaultTripsClient } from '../trips-api/client.gen';
import { TripDocumentUploadContextError } from './upload-context-error';
