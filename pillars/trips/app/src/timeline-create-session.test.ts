import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';

import { timelineCreateSession } from './timeline-create-session';
import { createClient } from './trips-api/client';
import { client as defaultClient } from './trips-api/client.gen';

import type { TimelineCreateKind } from './timeline-create-session';
import type {
  EventsCreateResponses,
  JourneysCreateResponses,
  PlacesCreateResponses,
  RentalsCreateResponses,
  StaysCreateResponses,
  VisitsCreateResponses,
} from './trips-api/types.gen';

const audit = { createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z' };
const common = { ...audit, id: 41, tripId: 7, sourceLinks: [], notes: '' };
const name = '  Harbour 東京  ';
const replies = {
  journey: { ...common, name, buffers: {}, reference: null },
  visit: { ...common, placeId: 9, timing: {}, revision: 0 },
  stay: {
    ...common,
    name,
    address: null,
    reference: null,
    visitId: null,
    kind: null,
    status: null,
    timing: {},
    documentLinks: [],
    hostLinks: [],
  },
  event: {
    ...common,
    name,
    address: null,
    reference: null,
    visitId: null,
    intention: null,
    arrangement: null,
    purchase: null,
    timing: {},
    sourceUrl: null,
    ticketUrl: null,
    venueLinks: [],
    organiserLinks: [],
    documentLinks: [],
  },
  rental: {
    ...audit,
    id: 41,
    tripId: 7,
    provider: name,
    revision: 0,
    pickupVisitId: null,
    returnVisitId: null,
    start: null,
    end: null,
    status: null,
  },
  place: { ...audit, id: 9, name, sourceLinks: [] },
} satisfies {
  journey: JourneysCreateResponses[201];
  visit: VisitsCreateResponses[201];
  stay: StaysCreateResponses[201];
  event: EventsCreateResponses[201];
  rental: RentalsCreateResponses[201];
  place: PlacesCreateResponses[201];
};

function fixture() {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const responses: (() => Response | Promise<Response>)[] = [];
  const client = createClient({
    baseUrl: 'https://trips.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push({
        method: request.method,
        path: new URL(request.url).pathname,
        body: await request.json(),
      });
      const next = responses.shift();
      if (!next) throw new Error('Missing explicit creation response');
      return next();
    },
  });
  const scope = new QueryClient();
  const identity = { tripId: 7, client };
  return {
    scope,
    identity,
    requests,
    responses,
    session: (kind: TimelineCreateKind) => timelineCreateSession(scope, identity, kind),
  };
}

const cases: { kind: TimelineCreateKind; path: string; body: object }[] = [
  { kind: 'visit', path: '/trips/7/visits', body: { placeId: 9 } },
  { kind: 'journey', path: '/trips/7/journeys', body: { name } },
  { kind: 'stay', path: '/trips/7/stays', body: { name } },
  { kind: 'event', path: '/trips/7/events', body: { name } },
  { kind: 'rental', path: '/trips/7/rentals', body: { provider: name } },
  { kind: 'place', path: '/places', body: { name } },
];

it.each(cases)(
  'sends only explicit $kind inputs and opens only an acknowledged identity',
  async ({ kind, path, body }) => {
    const owner = fixture();
    const session = owner.session(kind);
    const key =
      kind === 'place'
        ? ['trips', 'https://trips.test', 'places']
        : ['trips', 'https://trips.test', 7];
    owner.scope.setQueryData(key, 'cached source');
    session.edit({ text: name, placeId: 9 });
    owner.responses.push(() => Response.json(replies[kind], { status: 201 }));
    expect(await session.submit()).toEqual({ kind, id: kind === 'place' ? 9 : 41 });
    expect(owner.requests).toEqual([{ method: 'POST', path, body }]);
    expect(session.snapshot().status).toBe('confirmed');
    expect(owner.scope.getQueryState(key)?.isInvalidated).toBe(true);
    expect(await session.submit()).toBeUndefined();
    expect(owner.requests).toHaveLength(1);
  }
);

it('claims synchronously and retains pending, confirmed and drafts across consumer remount/cache eviction', async () => {
  const owner = fixture();
  const session = owner.session('journey');
  session.edit({ text: name });
  let resolve: ((response: Response) => void) | undefined;
  owner.responses.push(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      })
  );
  const submission = session.submit();
  expect(session.snapshot().status).toBe('pending');
  const reopened = owner.session('journey');
  expect(reopened).toBe(session);
  expect(await reopened.submit()).toBeUndefined();
  await new Promise<void>((done) => setTimeout(done, 0));
  if (!resolve) throw new Error('Missing dispatched create');
  resolve(Response.json(replies.journey, { status: 201 }));
  expect(await submission).toEqual({ kind: 'journey', id: 41 });
  owner.scope.clear();
  expect(owner.session('journey').snapshot()).toMatchObject({
    text: name,
    status: 'confirmed',
    created: { kind: 'journey', id: 41 },
  });
  expect(owner.requests).toHaveLength(1);
});

it.each([400, 404])('permits explicit retry after definitive HTTP %i rejection', async (status) => {
  const owner = fixture();
  const session = owner.session('event');
  session.edit({ text: name });
  owner.responses.push(() => Response.json({ code: 'rejected' }, { status }));
  expect(await session.submit()).toBeUndefined();
  expect(session.snapshot()).toMatchObject({ status: 'rejected', text: name });
  owner.responses.push(() => Response.json(replies.event, { status: 201 }));
  expect(await session.submit()).toEqual({ kind: 'event', id: 41 });
  expect(owner.requests).toHaveLength(2);
});

it.each(['network', 'server', 'wrong-status', 'foreign', 'invalid-id', 'malformed'] as const)(
  'locks %s outcomes until explicit acknowledgement of a new creation',
  async (failure) => {
    const owner = fixture();
    const session = owner.session('journey');
    session.edit({ text: name });
    owner.responses.push(() => {
      if (failure === 'network') throw new TypeError('Response lost');
      if (failure === 'server') return Response.json({}, { status: 503 });
      if (failure === 'wrong-status') return Response.json(replies.journey, { status: 200 });
      if (failure === 'foreign')
        return Response.json({ ...replies.journey, tripId: 8 }, { status: 201 });
      if (failure === 'invalid-id')
        return Response.json({ ...replies.journey, id: 0 }, { status: 201 });
      return Response.json({}, { status: 201 });
    });
    expect(await session.submit()).toBeUndefined();
    owner.scope.clear();
    const reopened = owner.session('journey');
    expect(reopened.snapshot()).toMatchObject({ status: 'unknown', text: name });
    reopened.edit({ text: 'Replacement' });
    expect(reopened.snapshot().text).toBe(name);
    expect(await reopened.submit()).toBeUndefined();
    expect(owner.requests).toHaveLength(1);
    reopened.beginNew();
    expect(reopened.snapshot()).toMatchObject({ status: 'idle', text: '', placeId: null });
  }
);

it('does not dispatch a Visit without a literal selected Place, or chain Place creation into Visit', async () => {
  const owner = fixture();
  const visit = owner.session('visit');
  for (const placeId of [null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    visit.edit({ placeId });
    expect(await visit.submit()).toBeUndefined();
    expect(visit.snapshot().status).toBe('rejected');
  }
  const place = owner.session('place');
  expect(await place.submit()).toBeUndefined();
  expect(owner.requests).toEqual([]);
  place.edit({ text: name });
  owner.responses.push(() => Response.json(replies.place, { status: 201 }));
  expect(await place.submit()).toEqual({ kind: 'place', id: 9 });
  expect(owner.requests).toHaveLength(1);
  expect(visit.snapshot().placeId).toBe(Number.MAX_SAFE_INTEGER + 1);
});

it('rejects acknowledged mismatched Place names and Visit selected-place identities', async () => {
  const owner = fixture();
  owner.responses.push(() => Response.json({ ...replies.place, name: 'Other' }, { status: 201 }));
  const place = owner.session('place');
  place.edit({ text: name });
  expect(await place.submit()).toBeUndefined();
  expect(place.snapshot().status).toBe('unknown');
  owner.responses.push(() => Response.json({ ...replies.visit, placeId: 12 }, { status: 201 }));
  const visit = owner.session('visit');
  visit.edit({ placeId: 9 });
  expect(await visit.submit()).toBeUndefined();
  expect(visit.snapshot().status).toBe('unknown');
});

it('isolates QueryClient/client/origin/Trip/kind and fences dispatch after origin changes', async () => {
  const owner = fixture();
  const session = owner.session('journey');
  session.edit({ text: name });
  expect(timelineCreateSession(new QueryClient(), owner.identity, 'journey')).not.toBe(session);
  expect(
    timelineCreateSession(owner.scope, { tripId: 8, client: owner.identity.client }, 'journey')
  ).not.toBe(session);
  expect(
    timelineCreateSession(
      owner.scope,
      { tripId: 7, client: createClient({ baseUrl: 'https://trips.test' }) },
      'journey'
    )
  ).not.toBe(session);
  expect(owner.session('stay')).not.toBe(session);
  owner.identity.client.setConfig({ baseUrl: 'https://other.test' });
  expect(session.isCurrent()).toBe(false);
  expect(await session.submit()).toBeUndefined();
  expect(owner.requests).toEqual([]);
  expect(owner.session('journey').snapshot().text).toBe('');
  owner.identity.client.setConfig({ baseUrl: 'https://trips.test' });
  expect(owner.session('journey')).toBe(session);
  expect(session.snapshot().text).toBe(name);
});

it('retains a validated acknowledgement for the original owner when its live origin changes during dispatch', async () => {
  const owner = fixture();
  owner.responses.push(() => {
    owner.identity.client.setConfig({ baseUrl: 'https://other.test' });
    return Response.json(replies.journey, { status: 201 });
  });
  const session = owner.session('journey');
  expect(await session.submit()).toEqual({ kind: 'journey', id: 41 });
  expect(session.snapshot()).toMatchObject({
    status: 'confirmed',
    created: { kind: 'journey', id: 41 },
  });
  expect(owner.requests).toHaveLength(1);
});

it.each(['journey', 'stay', 'event', 'rental'] as const)(
  'allows explicitly unnamed %s creation without inventing fields',
  async (kind) => {
    const owner = fixture();
    owner.responses.push(() => Response.json(replies[kind], { status: 201 }));
    expect(await owner.session(kind).submit()).toEqual({ kind, id: 41 });
    expect(owner.requests[0]?.body).toEqual({});
  }
);

it('requires beginNew after confirmation before a subsequent explicit POST', async () => {
  const owner = fixture();
  const session = owner.session('stay');
  owner.responses.push(() => Response.json(replies.stay, { status: 201 }));
  await session.submit();
  session.edit({ text: 'Another stay' });
  expect(session.snapshot().text).toBe('');
  expect(await session.submit()).toBeUndefined();
  expect(owner.requests).toHaveLength(1);
  session.beginNew();
  session.edit({ text: 'Another stay' });
  owner.responses.push(() =>
    Response.json({ ...replies.stay, id: 42, name: 'Another stay' }, { status: 201 })
  );
  expect(await session.submit()).toEqual({ kind: 'stay', id: 42 });
  expect(owner.requests).toHaveLength(2);
  expect(owner.requests[1]?.body).toEqual({ name: 'Another stay' });
});

it.each([408, 409, 422])(
  'locks undocumented HTTP %i creation outcomes instead of allowing duplicate retries',
  async (status) => {
    const owner = fixture();
    owner.responses.push(() => Response.json({}, { status }));
    const session = owner.session('event');
    expect(await session.submit()).toBeUndefined();
    expect(session.snapshot().status).toBe('unknown');
    expect(await owner.session('event').submit()).toBeUndefined();
    expect(owner.requests).toHaveLength(1);
  }
);

it('allows a definitive Rental conflict retry from its documented 409 contract', async () => {
  const owner = fixture();
  owner.responses.push(() => Response.json({}, { status: 409 }));
  const session = owner.session('rental');
  await session.submit();
  expect(session.snapshot().status).toBe('rejected');
});

it('uses the app default client and fences its original configured origin', async () => {
  const original = defaultClient.getConfig();
  const scope = new QueryClient();
  const requests: Request[] = [];
  try {
    defaultClient.setConfig({
      baseUrl: 'https://default.test',
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(replies.journey, { status: 201 });
      },
    });
    const session = timelineCreateSession(scope, { tripId: 7 }, 'journey');
    session.edit({ text: name });
    defaultClient.setConfig({ baseUrl: 'https://other.test' });
    expect(session.isCurrent()).toBe(false);
    expect(await session.submit()).toBeUndefined();
    expect(requests).toEqual([]);
    expect(timelineCreateSession(scope, { tripId: 7 }, 'journey')).not.toBe(session);
    defaultClient.setConfig({ baseUrl: 'https://default.test' });
    expect(timelineCreateSession(scope, { tripId: 7 }, 'journey')).toBe(session);
    expect(await session.submit()).toEqual({ kind: 'journey', id: 41 });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://default.test/trips/7/journeys');
  } finally {
    defaultClient.setConfig(original);
    scope.clear();
  }
});

it('retains a known original-owner 201 across view loss and origin replacement without invalidating the replacement cache', async () => {
  const owner = fixture();
  const originalKey = ['trips', 'https://trips.test', 7];
  const replacementKey = ['trips', 'https://other.test', 7];
  owner.scope.setQueryData(originalKey, 'original source');
  owner.scope.setQueryData(replacementKey, 'replacement source');
  let release: (response: Response) => void = () => {
    throw new Error('Response not initialized');
  };
  const response = new Promise<Response>((resolve) => {
    release = resolve;
  });
  owner.responses.push(() => {
    owner.identity.client.setConfig({ baseUrl: 'https://other.test' });
    return response;
  });
  const original = owner.session('journey');
  original.edit({ text: name });
  const submitted = original.submit();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const replacement = owner.session('journey');
  expect(replacement).not.toBe(original);
  expect(replacement.snapshot().status).toBe('idle');
  release(Response.json(replies.journey, { status: 201 }));
  expect(await submitted).toEqual({ kind: 'journey', id: 41 });
  expect(original.snapshot()).toMatchObject({
    status: 'confirmed',
    text: name,
    created: { kind: 'journey', id: 41 },
  });
  expect(owner.scope.getQueryState(originalKey)?.isInvalidated).toBe(true);
  expect(owner.scope.getQueryState(replacementKey)?.isInvalidated).toBe(false);
  expect(replacement.snapshot().created).toBeUndefined();
  owner.scope.clear();
  owner.identity.client.setConfig({ baseUrl: 'https://trips.test' });
  const reopened = owner.session('journey');
  expect(reopened).toBe(original);
  expect(reopened.snapshot().created).toEqual({ kind: 'journey', id: 41 });
  expect(await reopened.submit()).toBeUndefined();
  expect(owner.requests).toHaveLength(1);
});

it('retains pending and acknowledged creations on their actual client when another same-origin client is selected', async () => {
  const owner = fixture();
  const replacementClient = createClient({ baseUrl: 'https://trips.test' });
  const replacement = timelineCreateSession(
    owner.scope,
    { tripId: 7, client: replacementClient },
    'journey'
  );
  let release: (response: Response) => void = () => {
    throw new Error('Response not initialized');
  };
  const response = new Promise<Response>((resolve) => {
    release = resolve;
  });
  owner.responses.push(() => response);
  const original = owner.session('journey');
  const submitted = original.submit();
  expect(replacement.snapshot().status).toBe('idle');
  expect(original.snapshot().status).toBe('pending');
  release(Response.json(replies.journey, { status: 201 }));
  expect(await submitted).toEqual({ kind: 'journey', id: 41 });
  expect(replacement.snapshot().created).toBeUndefined();
  owner.scope.clear();
  expect(owner.session('journey').snapshot().created).toEqual({ kind: 'journey', id: 41 });
  expect(await original.submit()).toBeUndefined();
  expect(owner.requests).toHaveLength(1);
});
