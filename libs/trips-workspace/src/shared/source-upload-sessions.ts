import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { createTripDocumentUploadSession } from '../documents/trip-document-upload-session';
import { client as defaultTripsClient } from '../trips-api/client.gen';

import type { QueryClient } from '@tanstack/react-query';

import type {
  TripDocumentUploadContext,
  TripDocumentUploadSession,
} from '../documents/trip-document-upload-session';

interface RetainedUpload {
  key: string;
  tripsClient: TripDocumentUploadContext['tripsClient'];
  documentsClient: TripDocumentUploadContext['documentsClient'];
  session: TripDocumentUploadSession;
}
const registries = new WeakMap<QueryClient, RetainedUpload[]>();

/**
 * Retain owner queues for the Shell's QueryClient lifetime, independently of query-cache eviction.
 * Client replacement, origin changes and explicit source identities isolate queues; a full page
 * reload releases them. This is mount-lifetime storage, not an authenticated-principal boundary.
 */
export function sourceUploadSession(
  scope: QueryClient,
  context: TripDocumentUploadContext
): TripDocumentUploadSession {
  let entries = registries.get(scope);
  if (entries === undefined) {
    entries = [];
    registries.set(scope, entries);
  }
  const key = contextKey(context);
  const previous = entries.find(
    (entry) =>
      entry.key === key &&
      entry.tripsClient === context.tripsClient &&
      entry.documentsClient === context.documentsClient
  );
  if (previous !== undefined) {
    previous.session.assertContext(context);
    return previous.session;
  }
  const session = createTripDocumentUploadSession(context);
  entries.push({
    key,
    tripsClient: context.tripsClient,
    documentsClient: context.documentsClient,
    session,
  });
  return session;
}

function contextKey(context: TripDocumentUploadContext): string {
  return JSON.stringify([
    context.tripId,
    context.target.kind,
    context.target.id,
    (context.tripsClient ?? defaultTripsClient).getConfig().baseUrl ?? '',
    (context.documentsClient ?? defaultDocumentsClient).getConfig().baseUrl ?? '',
  ]);
}
