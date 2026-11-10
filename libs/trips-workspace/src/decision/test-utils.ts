import { createClient } from '../trips-api/client';

import type { DecisionSource } from './types';

/** Fictional typed source snapshot independent of playground fixtures. */
export function sourceDecision(revision = 0): DecisionSource {
  const audit = { createdAt: '2030-01-01T00:00:00Z', updatedAt: '2030-01-01T00:00:00Z' };
  return {
    decision: {
      id: 8,
      tripId: 7,
      question: 'Which departure?',
      deadline: null,
      notes: '',
      sourceLinks: [],
      selectedOptionId: null,
      revision,
      ...audit,
    },
    options: [
      {
        id: 9,
        decisionId: 8,
        title: 'Morning train',
        notes: 'Independent option notes',
        affectedSources: [{ kind: 'journey', id: 24 }],
        sourceLinks: [],
        ...audit,
      },
    ],
  };
}
/** Typed request transport with controllable atomic snapshots and exact recorded mutation bodies. */
export function decisionTransport(initial = sourceDecision()) {
  let source = structuredClone(initial);
  let failRead = false;
  let failWrite = false;
  const requests: { method: string; path: string; body?: unknown }[] = [];
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const body: unknown = request.method === 'GET' ? undefined : await request.json();
    requests.push({ method: request.method, path, body });
    if ((failRead && path.endsWith('/workspace')) || (failWrite && request.method !== 'GET'))
      return json(
        {
          code: 'trips.unavailable',
          message: 'Source unavailable',
          retryable: true,
          requestId: 'request-test',
        },
        503
      );
    if (path.endsWith('/workspace')) return json(source);
    if (request.method === 'GET')
      return json(
        {
          code: 'trips.context.unavailable',
          message: 'Context unavailable',
          retryable: true,
          requestId: 'request-context',
        },
        503
      );
    if (request.method === 'PATCH' && path === '/trips/7/decisions/8') {
      if (
        typeof body !== 'object' ||
        body === null ||
        !('expectedRevision' in body) ||
        body.expectedRevision !== source.decision.revision
      )
        return json(
          {
            code: 'trips.decision.decision_revision_conflict',
            message: 'Revision changed',
            retryable: false,
            requestId: 'request-conflict',
          },
          409
        );
      source = {
        ...source,
        decision: { ...source.decision, ...body, revision: source.decision.revision + 1 },
      };
      return json(source.decision);
    }
    return json(
      {
        code: 'trips.test.unsupported',
        message: 'Unsupported test request',
        retryable: false,
        requestId: 'request-unsupported',
      },
      400
    );
  };
  return {
    client: createClient({ baseUrl: 'https://decision.test', fetch: fetcher }),
    requests,
    snapshot: () => structuredClone(source),
    replace: (next: DecisionSource) => {
      source = next;
    },
    failRead: (value: boolean) => {
      failRead = value;
    },
    failWrite: (value: boolean) => {
      failWrite = value;
    },
  };
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
