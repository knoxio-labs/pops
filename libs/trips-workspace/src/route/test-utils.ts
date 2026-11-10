import { createClient } from '../trips-api/client';

import type { RouteOperation, RouteOperationResult, TripRoute, TripRouteRead } from './types';

/** Explicit fictional route replies, independent of design fixtures or producer algorithms. */
export function routeRead(overrides: Partial<TripRouteRead> = {}): TripRouteRead {
  return {
    tripId: 7,
    revision: 0,
    order: [{ kind: 'visit', id: 31 }],
    paths: [],
    missingSources: [],
    ...overrides,
  };
}
/** A matching own response; tests supply the actual outcome rather than simulating commands. */
export function routeResult(
  operation: RouteOperation,
  before: TripRoute,
  after: TripRoute
): RouteOperationResult {
  return {
    receipt: {
      operationId: operation.operationId,
      before: routeSnapshot(before),
      after: routeSnapshot(after),
      undoneOperationId:
        operation.command.kind === 'undo' ? operation.command.targetOperationId : null,
    },
    current: routeSnapshot(after),
    replayed: false,
    undone: false,
  };
}
/** Mutation wire snapshots exclude GET-only availability metadata. */
export function routeSnapshot(source: TripRoute): TripRoute {
  return {
    tripId: source.tripId,
    revision: source.revision,
    order: source.order,
    paths: source.paths,
  };
}
/** Real generated client with inspectable requests and explicit, optionally deferred replies. */
export function routeTransport() {
  const requests: Request[] = [];
  const replies: (() => Response | Promise<Response>)[] = [];
  const client = createClient({
    baseUrl: 'http://routes.test',
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      const reply = replies.shift();
      if (!reply) throw new Error('No explicit route response');
      return reply();
    },
  });
  return { client, requests, replies };
}
/** JSON transport response for focused generated-client tests. */
export function routeJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Explicitly controlled response delivery without changing the consumer's supported ECMAScript library. */
export function deferredRouteResponse() {
  let resolve: (response: Response) => void = () => {
    throw new Error('Uninitialized response');
  };
  const promise = new Promise<Response>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
