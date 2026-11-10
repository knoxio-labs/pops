import { sourcePlaces, sourceStay, sourceVisits } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { meetingPlan } from './test-utils';

import type { Client } from '../trips-api/client';
import type { MeetingPlan } from './types';

/** Explicit source responses and inspectable request bodies for generated-client consumer tests. */
export interface PeopleTransport {
  client: Client;
  writes: unknown[];
  replies: MeetingPlan[];
  failWrites: (value: boolean) => void;
  failReads: () => void;
}
interface TransportState {
  source: MeetingPlan;
  failWrites: boolean;
  failReads: boolean;
  writes: unknown[];
  replies: MeetingPlan[];
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
/** Generated transport returns only explicit test replies; it does not reimplement source validation. */
export function peopleTransport(initial: MeetingPlan = meetingPlan()): PeopleTransport {
  const state: TransportState = {
    source: initial,
    failWrites: false,
    failReads: false,
    writes: [],
    replies: [],
  };
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    return request.method === 'POST'
      ? write(request, state)
      : read(new URL(request.url).pathname, state);
  };
  return {
    client: createClient({ baseUrl: `http://people-${crypto.randomUUID()}.test`, fetch: fetcher }),
    writes: state.writes,
    replies: state.replies,
    failWrites: (value: boolean): void => {
      state.failWrites = value;
    },
    failReads: (): void => {
      state.failReads = true;
    },
  };
}
async function write(request: Request, state: TransportState): Promise<Response> {
  const operation: unknown = await request.json();
  state.writes.push(operation);
  if (
    typeof operation !== 'object' ||
    operation === null ||
    !('operationId' in operation) ||
    typeof operation.operationId !== 'string'
  )
    throw new Error('Invalid operation identity');
  if (state.failWrites)
    return json({ code: 'trips.test.offline', message: 'Unavailable', retryable: true }, 503);
  const before = state.source;
  state.source = state.replies.shift() ?? state.source;
  return json({
    receipt: {
      operationId: operation.operationId,
      undoneOperationId: null,
      before,
      after: state.source,
    },
    current: state.source,
    replayed: false,
    undone: false,
  });
}
function read(path: string, state: TransportState): Response {
  if (path.endsWith('/meeting-plans'))
    return state.failReads
      ? json({ code: 'trips.test.read', message: 'Unavailable', retryable: true }, 503)
      : json({ meetingPlans: state.source.removed ? [] : [state.source] });
  if (path.endsWith('/visits'))
    return json({
      visits: [
        { ...sourceVisits[0], id: 90 },
        { ...sourceVisits[0], id: 2 },
      ],
    });
  if (path === '/places') return json({ places: sourcePlaces });
  return json({
    id: 7,
    name: 'Trip source',
    destination: '',
    when: '',
    notes: '',
    parentId: null,
    tagId: null,
    sourceLinks: [],
    createdAt: sourceStay().createdAt,
    updatedAt: sourceStay().updatedAt,
  });
}
