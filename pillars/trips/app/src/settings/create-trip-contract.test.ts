import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';

import { createTripOperation } from '../api/source';
import { createClient } from '../trips-api/client';
import { creationResult } from './create-trip-persistence';
import {
  creationOperationId,
  creationReply,
  creationSession,
  creationTransport,
} from './create-trip-test-utils';
import { metadataTrip } from './metadata-test-utils';
import { tripDraft } from './model';

import type { TripCreateRequest, TripCreateResult } from '../api/types';

const request: TripCreateRequest = {
  operationId: '6a4abf45-05c8-4312-923c-00217863216b',
  command: { kind: 'trip.create', input: { when: '  opaque\nWhen  ' } },
};

it('validates only supplied fields against the receipt, not producer defaults or later current metadata', () => {
  const original = { ...metadataTrip, when: request.command.input.when ?? '' };
  const current = { ...original, when: 'Edited after creation', name: null };
  const value = {
    receipt: { operationId: request.operationId, trip: original },
    current: { trip: current },
    replayed: true,
  };
  expect(creationResult(value, request)).toEqual(value);
  expect(value.receipt.trip.when).toBe('  opaque\nWhen  ');
});

it.each(['uuid', 'id', 'input', 'trip-shape', 'replayed'] as const)(
  'rejects a foreign or malformed %s acknowledgement',
  async (field) => {
    const original = { ...metadataTrip, when: request.command.input.when ?? '' };
    const transport = creationTransport();
    transport.respond(async (submitted) => {
      const value: TripCreateResult = {
        receipt: { operationId: await creationOperationId(submitted), trip: original },
        current: { trip: original },
        replayed: false,
      };
      if (field === 'uuid') value.receipt.operationId = crypto.randomUUID();
      if (field === 'id') value.current.trip = { ...original, id: original.id + 1 };
      if (field === 'input') value.receipt.trip = { ...original, when: 'Foreign text' };
      if (field === 'trip-shape') value.current.trip = { ...original, id: -1 };
      return Response.json(field === 'replayed' ? { ...value, replayed: 'false' } : value, {
        status: 201,
      });
    });
    const session = creationSession(transport);
    session.change({ ...tripDraft(original), when: request.command.input.when ?? '' });
    await session.create();
    expect(session.snapshot().confirmed).toBe(false);
    expect(session.snapshot().locked).toBe(true);
    expect(session.snapshot().error).toBeDefined();
  }
);

it.each([400, 404, 409, 503])(
  'never falls back or silently replaces the UUID after HTTP %s',
  async (status) => {
    const transport = creationTransport();
    transport.reject('trips.test.unknown', status);
    const session = creationSession(transport);
    session.change(tripDraft(metadataTrip));
    await session.create();
    await session.create();
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.url).toBe('http://owner-a.test/trips/operations');
    expect(session.snapshot().locked).toBe(true);
    transport.respond((submitted) => creationReply(submitted));
    await session.retry();
    expect(transport.requests[1]).toEqual(transport.requests[0]);
    expect(session.snapshot().confirmed).toBe(true);
  }
);

it.each(['trips.trip.parent_invalid', 'trips.trip.tag_unknown'])(
  'permits a corrected new intent only after validated %s rejection',
  async (code) => {
    const transport = creationTransport();
    const session = creationSession(transport);
    session.change(tripDraft(metadataTrip));
    transport.reject(code);
    await session.create();
    expect(session.snapshot().locked).toBe(false);
    const corrected = { ...metadataTrip, name: 'Corrected' };
    session.change(tripDraft(corrected));
    transport.respond((submitted) => creationReply(submitted, corrected));
    await session.create();
    expect(transport.requests).toHaveLength(2);
    expect(transport.requests[1]?.body).not.toBe(transport.requests[0]?.body);
    expect(session.snapshot().confirmed).toBe(true);
  }
);

it.each([
  { code: 'trips.trip.parent_invalid' },
  { code: 'trips.trip.tag_unknown', message: 'Incomplete' },
])('does not trust malformed precommit error bodies %j', async (value) => {
  const transport = creationTransport();
  const session = creationSession(transport);
  transport.reply(value, 400);
  await session.create();
  expect(session.snapshot().locked).toBe(true);
  session.cancel();
  expect(session.snapshot().submitted).toBeDefined();
});

it.each([200, 202, 204])('does not admit an unexpected successful HTTP %s', async (status) => {
  const calls: string[] = [];
  const client = createClient({
    baseUrl: 'http://owner.test',
    fetch: async (input) => {
      calls.push(input instanceof Request ? input.url : String(input));
      return new Response(
        status === 204
          ? null
          : JSON.stringify({
              receipt: { operationId: request.operationId, trip: metadataTrip },
              current: { trip: metadataTrip },
              replayed: false,
            }),
        { status, headers: { 'content-type': 'application/json' } }
      );
    },
  });
  await expect(createTripOperation(request, { tripClient: client })).rejects.toThrow();
  expect(calls).toEqual(['http://owner.test/trips/operations']);
});

it('isolates the same origin across actual client instances and host caches', () => {
  const transport = creationTransport();
  const first = creationSession(transport);
  first.change({ ...tripDraft(), name: 'Private draft' });
  const otherCache = creationSession(transport, new QueryClient());
  const otherClient = creationSession(creationTransport(), first.owner.scope);
  expect(otherCache.snapshot().draft.name).toBe('');
  expect(otherClient.snapshot().draft.name).toBe('');
});
