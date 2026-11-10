import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { client as defaultTripsClient } from '../trips-api/client.gen';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';

/** Cache identities are scoped to the owner transport and explicit source ids. */
export const documentQueryKeys = {
  associations(client: TripsClient | undefined, tripId: number): readonly [string, string, number] {
    return ['trips-documents', (client ?? defaultTripsClient).getConfig().baseUrl ?? '', tripId];
  },
  routeVisits(client: TripsClient | undefined, tripId: number): readonly [string, string, number] {
    return [
      'trips-document-route',
      (client ?? defaultTripsClient).getConfig().baseUrl ?? '',
      tripId,
    ];
  },
  document(client: DocumentsClient | undefined, id: number): readonly [string, string, number] {
    return ['documents-original', (client ?? defaultDocumentsClient).getConfig().baseUrl ?? '', id];
  },
  search(client: DocumentsClient | undefined, query: string): readonly [string, string, string] {
    return [
      'documents-search',
      (client ?? defaultDocumentsClient).getConfig().baseUrl ?? '',
      query,
    ];
  },
  status(client: DocumentsClient | undefined): readonly [string, string] {
    return ['documents-status', (client ?? defaultDocumentsClient).getConfig().baseUrl ?? ''];
  },
  task(client: DocumentsClient | undefined, taskId: string): readonly [string, string, string] {
    return ['documents-task', (client ?? defaultDocumentsClient).getConfig().baseUrl ?? '', taskId];
  },
};
