import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { DocumentAssociationTarget } from './types';

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
