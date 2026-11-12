import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { createClient } from '../trips-api/client';
import { retainTripCreation } from './create-trip-store';
import { metadataTrip } from './metadata-test-utils';
import { useCreateTrip } from './use-create-trip';

import type { ReactNode } from 'react';

import type { Trip } from '../api/types';

/** Real generated-client requests are recorded before a controlled HTTP response or transport failure. */
export function creationTransport() {
  const requests: { url: string; body: string; method: string }[] = [];
  const responses: ((request: Request) => Promise<Response>)[] = [];
  const client = createClient({
    baseUrl: 'http://owner-a.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push({
        url: request.url,
        body: await request.clone().text(),
        method: request.method,
      });
      const respond = responses.shift();
      if (!respond) throw new Error('Unexpected creation request');
      return respond(request);
    },
  });
  return {
    client,
    requests,
    respond: (response: (request: Request) => Promise<Response>): void => {
      responses.push(response);
    },
    reply: (value: unknown, status = 201): void => {
      responses.push(async () => Response.json(value, { status }));
    },
    reject: (code: string, status = 400): void => {
      responses.push(async () =>
        Response.json(
          {
            code,
            message: 'Creation rejected',
            retryable: false,
            requestId: 'creation-test',
          },
          { status }
        )
      );
    },
  };
}

/** A response uses the submitted UUID while keeping original and current source metadata distinct. */
export async function creationReply(
  request: Request,
  trip: Trip = metadataTrip,
  current: Trip = trip,
  replayed = false
): Promise<Response> {
  const operationId = await creationOperationId(request);
  return Response.json(
    {
      receipt: { operationId, trip },
      current: { trip: current },
      replayed,
    },
    { status: 201 }
  );
}

/** Read only the recorded UUID without asserting a parallel request DTO. */
export async function creationOperationId(request: Request): Promise<string> {
  const body: unknown = await request.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('operationId' in body) ||
    typeof body.operationId !== 'string'
  )
    throw new Error('Missing creation UUID');
  return body.operationId;
}

/** Retain the actual creation controller inside the owning host cache, without a synthetic Trip identity. */
export function creationSession(
  transport: ReturnType<typeof creationTransport>,
  scope = new QueryClient()
) {
  return retainTripCreation(scope, transport.client);
}

/** Render the production hook with configurable host mutation retries to prove no automatic command replay. */
export function mountCreation(
  transport: ReturnType<typeof creationTransport>,
  created: (trip: Trip) => void,
  cache = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } })
) {
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook(({ open }) => useCreateTrip({ tripClient: transport.client }, created, open), {
      initialProps: { open: true },
      wrapper,
    }),
    cache,
  };
}

/** Controlled asynchronous outcome has no timer or implicit retry. */
export function creationGate() {
  let release = (): void => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}
