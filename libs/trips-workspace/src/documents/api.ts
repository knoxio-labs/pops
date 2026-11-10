import { unwrap } from '@pops/pillar-sdk/client';

import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import {
  paperlessGet,
  paperlessSearch,
  paperlessStatus,
  paperlessTask,
} from '../documents-api/sdk.gen';
import {
  documentAssociationsCreate,
  documentAssociationsDelete,
  documentAssociationsList,
  eventsList,
  journeysList,
  placesList,
  staysList,
  visitsList,
} from '../trips-api/sdk.gen';
import { readAcceptedTaskId, readPaperlessTask } from './owner-responses';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { DocumentAssociationTarget, TripDocumentAssociation } from './types';
import type {
  PaperlessDocument,
  PaperlessSearchDocument,
  PaperlessTask,
  PaperlessUploadPolicy,
} from './types';

/** Read all explicit document links for a trip without deriving source membership. */
export async function loadDocumentAssociations(
  tripId: number,
  client?: TripsClient
): Promise<TripDocumentAssociation[]> {
  return unwrap(await documentAssociationsList({ client, path: { tripId } })).associations;
}

/** Read visit order from the Trips route contract for route-context grouping. */
export async function loadTripRouteVisitIds(
  tripId: number,
  client?: TripsClient
): Promise<number[]> {
  return unwrap(await visitsList({ client, path: { tripId } })).visits.map((visit) => visit.id);
}

/** Resolve display names and explicitly declared visit membership for linked Trips sources. */
export interface TripDocumentTargetRecord {
  name: string | undefined;
  visitId: number | null;
}

/** Resolve Trips labels and memberships, rechecking the captured owner before every independent dispatch. */
export async function loadTripDocumentTargets(
  tripId: number,
  client?: TripsClient,
  beforeRead: () => void = () => {}
): Promise<Map<string, TripDocumentTargetRecord>> {
  beforeRead();
  const visits = unwrap(await visitsList({ client, path: { tripId } }));
  beforeRead();
  const places = unwrap(await placesList({ client }));
  beforeRead();
  const stays = unwrap(await staysList({ client, path: { tripId } }));
  beforeRead();
  const events = unwrap(await eventsList({ client, path: { tripId } }));
  beforeRead();
  const journeys = unwrap(await journeysList({ client, path: { tripId } }));
  const placeNames = new Map(places.places.map((place) => [place.id, place.name]));
  const visitNames = new Map(
    visits.visits.map((visit) => [visit.id, placeNames.get(visit.placeId)])
  );
  const names = new Map<string, TripDocumentTargetRecord>();
  for (const visit of visits.visits) {
    const name = visitNames.get(visit.id);
    names.set(`visit:${String(visit.id)}`, { name, visitId: visit.id });
  }
  for (const stay of stays.stays) {
    names.set(`stay:${String(stay.id)}`, { name: stay.name ?? undefined, visitId: stay.visitId });
  }
  for (const event of events.events) {
    names.set(`event:${String(event.id)}`, {
      name: event.name ?? undefined,
      visitId: event.visitId,
    });
  }
  for (const journey of journeys.journeys) {
    names.set(`journey:${String(journey.id)}`, { name: journey.name ?? undefined, visitId: null });
  }
  return names;
}

/** Read one original's current metadata through the Documents owner. */
export async function loadPaperlessDocument(
  id: number,
  client?: DocumentsClient
): Promise<PaperlessDocument> {
  return unwrap(await paperlessGet({ client, path: { id } })).data;
}

/** Search current owner records; queries shorter than the contract minimum are not sent. */
export async function searchPaperlessDocuments(
  query: string,
  client?: DocumentsClient
): Promise<PaperlessSearchDocument[]> {
  if (query.length < 2) return [];
  return unwrap(await paperlessSearch({ client, query: { query } })).data;
}

/** Read Documents availability and the configured upload limits. */
export async function loadPaperlessUploadPolicy(
  client?: DocumentsClient
): Promise<PaperlessUploadPolicy> {
  const { data } = unwrap(await paperlessStatus({ client }));
  return {
    configured: data.configured,
    available: data.available,
    maxUploadBytes: data.maxUploadBytes,
    allowedMimeTypes: data.allowedMimeTypes,
  };
}

/** Resolve one actual owner task to its canonical original identity or failure. */
export async function loadPaperlessTask(
  taskId: string,
  client?: DocumentsClient
): Promise<PaperlessTask> {
  return readPaperlessTask(unwrap(await paperlessTask({ client, path: { taskId } })).data);
}

/** Send the original file body to Documents and return its accepted task identity. */
export async function uploadPaperlessDocument(
  file: File,
  client: DocumentsClient = defaultDocumentsClient
): Promise<string> {
  const result = await client.post<
    { 202: { data: { taskId: string } } },
    { 400: unknown; 413: unknown; 415: unknown; 422: unknown; 503: unknown }
  >({
    url: '/paperless/documents',
    query: { fileName: file.name },
    body: file,
    bodySerializer: null,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  return readAcceptedTaskId(unwrap(result));
}

/** Create an explicit link while keeping the Documents original untouched. */
export async function associatePaperlessDocument(
  tripId: number,
  documentId: number,
  target: DocumentAssociationTarget,
  client?: TripsClient
): Promise<TripDocumentAssociation> {
  return unwrap(
    await documentAssociationsCreate({
      client,
      path: { tripId },
      body: { documentId, targetKind: target.kind, targetId: target.id },
    })
  );
}

/** Remove only this Trips association; it never calls a Documents write route. */
export async function unlinkPaperlessDocument(
  tripId: number,
  associationId: number,
  client?: TripsClient
): Promise<void> {
  unwrap(await documentAssociationsDelete({ client, path: { tripId, id: associationId } }));
}

/** Resolve the owner's original-file URL through the authenticated same-origin proxy. */
export function paperlessOriginalUrl(documentId: number): string {
  return `/documents-api/paperless/documents/${String(documentId)}/download?original=true`;
}

/** Resolve a thumbnail through Documents rather than exposing the Paperless network URL. */
export function paperlessThumbnailUrl(documentId: number): string {
  return `/documents-api/documents/${String(documentId)}/thumbnail`;
}
