import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';

import { loadCalendar } from '../calendar/api';
import { deferred } from '../capture/test-utils';
import { sourceJourney } from '../journey/test-utils';
import { assertSourceOwner, RetainedSessionStore } from '../shared/retained-session-store';
import { createClient } from '../trips-api/client';

it('fences Calendar secondary workspace reads after asynchronous collection preparation', async () => {
  const barrier = deferred<Response>();
  const paths: string[] = [];
  const client = createClient({
    baseUrl: 'http://owner-a.test',
    fetch: async (input, init) => {
      const path = new URL(new Request(input, init).url).pathname;
      paths.push(path);
      if (path === '/trips/7/journeys') return barrier.promise;
      return new Response(JSON.stringify({ groups: [], stays: [], events: [] }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const { owner } = new RetainedSessionStore<undefined>().retain(
    new QueryClient(),
    { client, tripId: 7, kind: 'overview-calendar', sourceId: 0 },
    () => undefined
  );
  const read = loadCalendar({ tripId: 7, client }, undefined, () => assertSourceOwner(owner));
  client.setConfig({ baseUrl: 'http://owner-b.test' });
  barrier.resolve(
    new Response(JSON.stringify({ journeys: [sourceJourney()] }), {
      headers: { 'content-type': 'application/json' },
    })
  );
  const outcome: unknown = await read.catch((error: unknown) => error);
  expect(paths).toEqual([
    '/trips/7/journeys',
    '/trips/7/journey-groups',
    '/trips/7/stays',
    '/trips/7/events',
  ]);
  expect(outcome).toMatchObject({ code: 'web.source.context_changed' });
});
