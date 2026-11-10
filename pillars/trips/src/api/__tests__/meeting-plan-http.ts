import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

import { MeetingPlanOperationResultSchema } from '../../contract/meeting-plan-schemas.js';
import { meetingFixture } from '../../db/__tests__/meeting-plan-fixture.js';
import { createTripsApiApp } from '../app.js';

import type {
  MeetingPlanOperation,
  MeetingPlanOperationResult,
} from '../../contract/meeting-plan-schemas.js';
import type { MeetingFixture } from '../../db/__tests__/meeting-plan-fixture.js';
import type { MeetingContactResolver } from '../rest/meeting-plan-contact.js';

/** Bound source HTTP harness. */
export interface MeetingHttp extends Omit<MeetingFixture, 'create'> {
  origin: string;
  path: string;
  request: (url: string, method?: string, body?: unknown, key?: string | null) => Promise<Response>;
  operation: (command: MeetingPlanOperation['command'], operationId?: string) => Promise<Response>;
  create: () => Promise<MeetingPlanOperationResult>;
  close: () => Promise<void>;
}

/** Authenticated real HTTP/SQLite harness with an injected owning Contacts reference API. */
export async function meetingHttp(
  resolveMeetingContact: MeetingContactResolver
): Promise<MeetingHttp> {
  const fixture = meetingFixture();
  const server = createTripsApiApp({
    tripsDb: fixture.opened,
    version: 'test',
    selfBaseUrl: 'http://localhost:3018',
    resolveMeetingContact,
    serviceAccountVerifier: async (key) => ({
      outcome: 'authenticated',
      principal: {
        id: 'test',
        name: 'test',
        scopes: [key === 'meeting' ? 'trips.meetingPlans' : 'trips.stays'],
      },
    }),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
  const origin = `http://127.0.0.1:${address.port}`;
  const path = `/trips/${fixture.trip.id}/meeting-plans`;
  const request = (
    url: string,
    method = 'GET',
    body?: unknown,
    key: string | null = 'meeting'
  ): Promise<Response> =>
    fetch(`${origin}${url}`, {
      method,
      headers: {
        ...(key === null ? {} : { 'x-api-key': key }),
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const operation = (
    command: MeetingPlanOperation['command'],
    operationId: string = randomUUID()
  ): Promise<Response> => request(`${path}/operations`, 'POST', { operationId, command });
  const create = async (): Promise<MeetingPlanOperationResult> => {
    const response = await operation({
      kind: 'create',
      input: { contactUri: 'pops:contacts/contact/historical' },
    });
    if (response.status !== 200) throw new Error(`Create failed: ${response.status}`);
    return MeetingPlanOperationResultSchema.parse(await response.json());
  };
  const close = async (): Promise<void> => {
    server.closeIdleConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    fixture.opened.raw.close();
  };
  return { ...fixture, origin, path, request, operation, create, close };
}

/** Controllable asynchronous source response for races spanning an external API await. */
export function deferredMeetingValue<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolveValue: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (resolveValue === undefined) throw new Error('Promise executor did not initialize');
      resolveValue(value);
    },
  };
}
