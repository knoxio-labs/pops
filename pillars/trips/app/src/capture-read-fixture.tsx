import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { z } from 'zod';

import { CaptureContext } from './index';
import { createClient } from './trips-api/client';

import type { CaptureSource } from '@pops/trips-workspace/capture-client';

import type { CaptureContextProps } from './index';

function deferred() {
  let release: () => void = () => {
    throw new Error('Gate not started');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
type Gate = ReturnType<typeof deferred>;
interface State {
  reads: string[];
  writes: { url: string; body: unknown }[];
  failA: boolean;
  failWrites: boolean;
  read?: Gate;
  write?: Gate;
}
function source(title: string): CaptureSource {
  return {
    captures: [
      {
        id: 19,
        tripId: 1,
        originalText: 'Raw source',
        originalUrl: null,
        title,
        notes: '',
        classification: null,
        placeId: null,
        visitId: null,
        attachments: [],
        revision: 1,
        removedAt: null,
        createdAt: '',
        updatedAt: '',
      },
    ],
    ideas: [],
    associations: [],
    memberships: [],
    events: [],
    journeys: [],
    stays: [],
  };
}
function transport(state: State): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const host = new URL(request.url).hostname;
    if (request.method === 'POST') {
      const body: unknown = await request.json();
      state.writes.push({ url: request.url, body });
      const { operationId } = z.object({ operationId: z.uuid() }).parse(body);
      const hold = state.write;
      state.write = undefined;
      if (hold) await hold.promise;
      return state.failWrites
        ? Response.json({}, { status: 503 })
        : Response.json({
            receipt: { ...source(host), operationId, undoneOperationId: null },
            current: source(host),
            replayed: state.writes.length > 1,
            undone: false,
          });
    }
    if (request.url.endsWith('/capture-workspace')) {
      state.reads.push(request.url);
      const hold = state.read;
      state.read = undefined;
      if (hold) await hold.promise;
      if (host === 'owner-a.test' && state.failA) return Response.json({}, { status: 503 });
      return Response.json(source(host));
    }
    return Response.json({ places: [], visits: [] });
  };
}

/** Generated-client context with independently controlled read/write responses and one owning cache. */
export function captureReadOwner() {
  const state: State = { reads: [], writes: [], failA: false, failWrites: false };
  const client = createClient({ baseUrl: 'http://owner-a.test', fetch: transport(state) });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (props: Partial<CaptureContextProps> = {}) => (
    <QueryClientProvider client={cache}>
      <CaptureContext
        tripId={1}
        view="capture"
        client={client}
        selectedSource={{ kind: 'capture', id: 19 }}
        {...props}
      />
    </QueryClientProvider>
  );
  return {
    state,
    client,
    cache,
    view,
    source,
    mount: (props: Partial<CaptureContextProps> = {}) => render(view(props)),
    holdRead: () => {
      const gate = deferred();
      state.read = gate;
      return gate;
    },
    holdWrite: () => {
      const gate = deferred();
      state.write = gate;
      return gate;
    },
    close: () => {
      state.read?.release();
      state.write?.release();
      cache.clear();
    },
  };
}
