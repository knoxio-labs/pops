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
    tripsClient?.getConfig().baseUrl ?? 'default-trips',
    documentsClient?.getConfig().baseUrl ?? 'default-documents',
    String(tripId),
    target.kind,
    String(target.id),
  ].join(':');
}
