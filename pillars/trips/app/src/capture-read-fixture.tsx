import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { z } from 'zod';

import {
  captureReadSource as source,
  captureReadPlaces,
  captureReadVisits,
} from './capture-owner-fixtures';
import { CaptureContext } from './index';
import { createClient } from './trips-api/client';

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
  contextReads: string[];
  failContextA: boolean;
  context: Partial<Record<'places' | 'visits', Gate>>;
  read?: Gate;
  write?: Gate;
}
async function catalogueResponse(state: State, request: Request, host: string): Promise<Response> {
  const kind = request.url.endsWith('/places') ? 'places' : 'visits';
  state.contextReads.push(request.url);
  const hold = state.context[kind];
  delete state.context[kind];
  if (hold) await hold.promise;
  if (host === 'owner-a.test' && state.failContextA) return Response.json({}, { status: 503 });
  return Response.json(
    kind === 'places'
      ? { places: captureReadPlaces(host) }
      : { visits: captureReadVisits(host === 'owner-a.test' ? 11 : 29) }
  );
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
    return request.url.endsWith('/places') || request.url.endsWith('/visits')
      ? catalogueResponse(state, request, host)
      : Response.json({});
  };
}

/** Generated-client context with independently controlled read/write responses and one owning cache. */
export function captureReadOwner() {
  const state: State = {
    reads: [],
    writes: [],
    failA: false,
    failWrites: false,
    contextReads: [],
    failContextA: false,
    context: {},
  };
  const gates = new Set<Gate>();
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
      gates.add(gate);
      state.read = gate;
      return gate;
    },
    holdWrite: () => {
      const gate = deferred();
      gates.add(gate);
      state.write = gate;
      return gate;
    },
    holdCatalogue: (kind: 'places' | 'visits') => {
      const gate = deferred();
      gates.add(gate);
      state.context[kind] = gate;
      return gate;
    },
    close: () => {
      for (const gate of gates) gate.release();
      cache.clear();
    },
  };
}
