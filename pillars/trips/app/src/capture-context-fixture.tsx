import { once } from 'node:events';
import { createServer } from 'node:http';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { z } from 'zod';

import { DocumentUploadProvider } from '@pops/trips-workspace';

import { createDocumentUploadHost } from './document-upload-host-fixture';
import { CaptureContext } from './index';
import { createClient } from './trips-api/client';

import type { IncomingMessage, ServerResponse } from 'node:http';

import type { DocumentUploadHostCapability } from '@pops/pillar-sdk';
import type { CaptureSource } from '@pops/trips-workspace/capture-client';

import type { CaptureContextProps } from './index';

async function requestBody(request: IncomingMessage): Promise<unknown> {
  if (request.method !== 'POST') return null;
  let text = '';
  for await (const chunk of request)
    text += Buffer.isBuffer(chunk) ? chunk.toString() : z.string().parse(chunk);
  return JSON.parse(text);
}

interface OwnerState {
  requests: { method: string; path: string; body: unknown }[];
  source: CaptureSource;
  loseNextWrite: boolean;
}

function workspaceForTrip(source: CaptureSource, path: string): CaptureSource {
  const tripId = Number(path.match(/\/trips\/(\d+)\//)?.[1]);
  return {
    captures: source.captures.filter((row) => row.tripId === tripId),
    ideas: source.ideas.filter((row) => row.tripId === tripId),
    associations: source.associations.filter((row) => row.tripId === tripId),
    memberships: source.memberships.filter((row) => row.tripId === tripId),
    events: source.events.filter((row) => row.tripId === tripId),
    journeys: source.journeys.filter((row) => row.tripId === tripId),
    stays: source.stays.filter((row) => row.tripId === tripId),
  };
}

async function answerOwner(
  state: OwnerState,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const path = request.url ?? '';
  const body = await requestBody(request);
  state.requests.push({ method: request.method ?? '', path, body });
  response.setHeader('content-type', 'application/json');
  if (request.method === 'POST' && path.endsWith('/captures/create')) {
    const { operationId } = z.object({ operationId: z.uuid() }).parse(body);
    if (state.loseNextWrite) {
      state.loseNextWrite = false;
      response.destroy();
      return;
    }
    response.end(
      JSON.stringify({
        receipt: { ...state.source, operationId, undoneOperationId: null },
        current: state.source,
        replayed: state.requests.filter((entry) => entry.method === 'POST').length > 1,
        undone: false,
      })
    );
  } else if (path.endsWith('/capture-workspace'))
    response.end(JSON.stringify(workspaceForTrip(state.source, path)));
  else if (path.endsWith('/places')) response.end(JSON.stringify({ places: [] }));
  else if (path.endsWith('/visits')) response.end(JSON.stringify({ visits: [] }));
  else if (path.endsWith('/paperless/status'))
    response.end(
      JSON.stringify({
        data: {
          configured: false,
          available: false,
          maxUploadBytes: null,
          allowedMimeTypes: null,
        },
      })
    );
  else {
    response.writeHead(404);
    response.end('{}');
  }
}

function renderContext(
  cache: QueryClient,
  client: CaptureContextProps['client'],
  documentUploads: DocumentUploadHostCapability,
  props: Partial<CaptureContextProps>
) {
  const context = {
    tripId: 7,
    view: 'capture' as const,
    client,
    documentsClient: client,
    ...props,
  };
  return render(
    <QueryClientProvider client={cache}>
      <DocumentUploadProvider
        host={documentUploads}
        tripId={context.tripId}
        tripsClient={context.client}
        documentsClient={context.documentsClient}
      >
        <main>
          <h1>Owning Trip workspace</h1>
          <CaptureContext {...context} />
        </main>
      </DocumentUploadProvider>
    </QueryClientProvider>
  );
}

/** A real HTTP owner fixture, with explicit request loss and no inferred source data. */
export async function captureOwner() {
  const state: OwnerState = {
    requests: [],
    loseNextWrite: false,
    source: {
      captures: [],
      ideas: [],
      associations: [],
      memberships: [],
      events: [],
      journeys: [],
      stays: [],
    },
  };
  const server = createServer((request, response) => {
    void answerOwner(state, request, response).catch(() => {
      response.writeHead(500);
      response.end('{}');
    });
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing capture owner address');
  const origin = `http://127.0.0.1:${address.port}`;
  const client = createClient({ baseUrl: origin });
  const documentUploads = createDocumentUploadHost(origin);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    cache,
    requests: state.requests,
    source: state.source,
    client,
    documentUploads,
    alternateClient: createClient({ baseUrl: `${origin}/another-origin` }),
    loseNextWrite: () => {
      state.loseNextWrite = true;
    },
    mount: (props: Partial<CaptureContextProps> = {}) =>
      renderContext(cache, client, documentUploads, props),
    close: async () => {
      documentUploads.invalidate();
      cache.clear();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}
