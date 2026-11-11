import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import { sourceEvent } from '../event/test-utils';
import { journeyTransport, sourceJourney } from '../journey/test-utils';
import { sourceUploadSession } from '../shared/source-upload-sessions';
import { sourceStay } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { ArrangementsWorkspace } from './ArrangementsWorkspace';
import { arrangementsTransport, labels } from './test-utils';

import type { RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { TripDocumentUploadSession } from '../documents/trip-document-upload-session';
import type {
  DocumentAssociationTarget,
  PaperlessUploadPolicy,
  TripDocumentAssociation,
} from '../documents/types';
import type { Client as TripsClient } from '../trips-api/client';
import type { ArrangementsWorkspaceProps } from './types';

/** Real generated Documents client with observable pending owner requests. */
export interface ArrangementDocumentsOwner {
  client: DocumentsClient;
  requests: Request[];
  responses: ((response: Response) => void)[];
}

/** Real generated Trips client and exact association writes. */
export interface ArrangementDocumentTrips {
  client: TripsClient;
  links: { url: string; body: unknown }[];
}

/** Complete actual parent mount with retained owners and a reusable QueryClient. */
export interface ArrangementDocumentsHarness {
  trips: ArrangementDocumentTrips;
  documents: ArrangementDocumentsOwner;
  cache: QueryClient;
  identity: ArrangementsWorkspaceProps;
  view: RenderResult;
  content: (current?: ArrangementsWorkspaceProps, generation?: number) => ReactElement;
  session: (
    target?: DocumentAssociationTarget,
    current?: ArrangementsWorkspaceProps
  ) => TripDocumentUploadSession;
}

/** Generated Documents transport retaining actual pending owner responses without replacing upload controllers. */
export function arrangementDocumentsOwner(): ArrangementDocumentsOwner {
  const requests: Request[] = [];
  const responses: ((response: Response) => void)[] = [];
  const policy: PaperlessUploadPolicy = {
    configured: true,
    available: true,
    maxUploadBytes: 1000,
    allowedMimeTypes: ['application/pdf'],
  };
  const client = createDocumentsClient({
    baseUrl: 'http://documents.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === 'POST')
        return new Promise<Response>((resolve) => responses.push(resolve));
      const path = new URL(request.url).pathname;
      if (path.endsWith('/paperless/status')) return Response.json({ data: policy });
      if (path.includes('/paperless/tasks/'))
        return Response.json({ data: { state: 'done', documentId: 91, reason: null } });
      if (path.endsWith('/paperless/documents/91'))
        return Response.json({
          data: {
            id: 91,
            title: 'Accepted original',
            originalFileName: 'accepted.pdf',
            created: '',
            thumbnailUrl: '',
          },
        });
      throw new Error(`Unexpected Documents request ${request.method} ${path}`);
    },
  });
  return { client, requests, responses };
}

/** Actual arrangement collections and canonical source endpoints with explicit document association responses. */
export function arrangementDocumentTrips(): ArrangementDocumentTrips {
  const arrangements = arrangementsTransport();
  const journey = journeyTransport();
  const fallback = arrangements.client.getConfig().fetch;
  const journeyFetch = journey.client.getConfig().fetch;
  if (!fallback || !journeyFetch) throw new Error('Generated fixture transports are missing');
  const links: { url: string; body: unknown }[] = [];
  const associations: TripDocumentAssociation[] = [];
  const client = createClient({
    baseUrl: 'http://arrangements.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path.endsWith('/document-associations')) {
        if (request.method === 'GET') return Response.json({ associations });
        const body: unknown = await request.json();
        links.push({ url: request.url, body });
        const association: TripDocumentAssociation = {
          id: 81,
          tripId: 7,
          documentId: 91,
          targetKind: 'stay',
          targetId: 13,
          createdAt: '2029-01-01T00:00:00Z',
        };
        associations.push(association);
        return Response.json(association, { status: 201 });
      }
      if (path === '/trips/7/stays/13') return Response.json(sourceStay());
      if (path === '/trips/7/events/19') return Response.json(sourceEvent());
      if (path.startsWith('/trips/7/journeys/') || path.endsWith('/journey-groups'))
        return journeyFetch(request);
      return fallback(request);
    },
  });
  return { client, links };
}

/** Mount the complete actual parent under a reusable QueryClient and expose only its real owner contexts. */
export function arrangementDocumentsHarness(): ArrangementDocumentsHarness {
  const trips = arrangementDocumentTrips();
  const documents = arrangementDocumentsOwner();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const identity: ArrangementsWorkspaceProps = {
    tripId: 7,
    client: trips.client,
    documentsClient: documents.client,
    labels,
    formatDate: (date) => date,
  };
  const content = (current = identity, generation = 0): ReactElement => (
    <QueryClientProvider client={cache}>
      <ArrangementsWorkspace key={generation} {...current} />
    </QueryClientProvider>
  );
  const view = render(content());
  const session = (
    target: DocumentAssociationTarget = { kind: 'stay', id: 13 },
    current = identity
  ): TripDocumentUploadSession =>
    sourceUploadSession(cache, {
      tripId: current.tripId,
      target,
      tripsClient: current.client,
      documentsClient: current.documentsClient,
    });
  return { trips, documents, cache, identity, view, content, session };
}

/** Open one real arrangement card and wait for its canonical source upload entry. */
export async function openArrangementDocuments(
  kind: 'stay' | 'event' | 'journey'
): Promise<HTMLElement> {
  const title = {
    stay: sourceStay().name,
    event: sourceEvent().name,
    journey: sourceJourney().name,
  }[kind];
  if (title === null) throw new Error('Fixture source title is missing');
  const card = await screen.findByRole('article', { name: title });
  await userEvent.click(within(card).getByRole('button'));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() =>
    expect(within(dialog).getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
  );
  return dialog;
}

/** Select actual browser File handles through the canonical source input. */
export async function selectArrangementFiles(files: File[]): Promise<void> {
  const input = screen.getByRole('dialog').querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('Canonical source file input is missing');
  await userEvent.upload(input, files);
}
