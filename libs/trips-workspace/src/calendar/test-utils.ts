import { sourceJourney, sourceLeg, sourceProblem } from '../journey/test-utils';
import { sourceStay } from '../stay/test-utils';
import { createClient } from '../trips-api/client';

import type { CalendarEvent, CalendarSnapshot } from './types';

/** Fictional independently captured event with an alternative intention. */
export function sourceEvent(patch: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 60,
    tripId: 7,
    visitId: null,
    name: 'Evening exhibition',
    intention: 'Alternative',
    arrangement: 'Booked',
    purchase: null,
    timing: { start: '2029-02-01', startTime: '20:30', timeZone: 'Pacific/Auckland' },
    address: null,
    reference: null,
    sourceUrl: null,
    ticketUrl: null,
    notes: '',
    sourceLinks: [],
    venueLinks: [],
    organiserLinks: [],
    documentLinks: [],
    createdAt: '2029-01-01T00:00:00Z',
    updatedAt: '2029-01-01T00:00:00Z',
    ...patch,
  };
}
/** Complete fictional transport snapshot, unrelated to design fixtures. */
export function calendarSnapshot(): CalendarSnapshot {
  return {
    groups: [],
    journeys: [
      {
        journey: sourceJourney(),
        legs: [sourceLeg({ from: { local: '2029-02-01T22:15', timeZone: 'Pacific/Auckland' } })],
        timing: {
          journeyId: 20,
          legs: [
            {
              legId: 40,
              departure: '2029-02-01T09:15:00Z',
              arrival: '2029-02-01T12:15:00Z',
              elapsedMinutes: 180,
            },
          ],
          connections: [],
          window: { from: '2029-01-31T11:00:00Z', toExclusive: '2029-02-03T11:00:00Z' },
          findings: [],
        },
      },
    ],
    stays: [
      sourceStay({
        id: 30,
        name: 'Harbour house',
        timing: { arrival: '2029-02-01', departure: '2029-02-04' },
      }),
    ],
    events: [sourceEvent()],
  };
}
/** Generated-client boundary seam; rejects unexpected reads and records cancellation and source identities. */
export function calendarTransport(initial = calendarSnapshot(), origin = 'http://calendar.test') {
  let snapshot = initial;
  let failure: string | undefined;
  let wait: Promise<void> | undefined;
  let workspaceBody: unknown;
  const requests: { path: string; signal: AbortSignal }[] = [];
  const client = createClient({
    baseUrl: origin,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      requests.push({ path, signal: request.signal });
      await wait;
      request.signal.throwIfAborted();
      if (failure === path)
        return new Response(JSON.stringify(sourceProblem('trips.calendar.unavailable')), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      let body: unknown;
      if (path === '/trips/7/journeys')
        body = { journeys: snapshot.journeys.map((item) => item.journey) };
      else if (path === '/trips/7/journey-groups') body = { groups: snapshot.groups };
      else if (path === '/trips/7/stays') body = { stays: snapshot.stays };
      else if (path === '/trips/7/events') body = { events: snapshot.events };
      else {
        const match = snapshot.journeys.find(({ journey }) =>
          path.startsWith(`/trips/7/journeys/${journey.id}/`)
        );
        if (match && path.endsWith('/workspace')) body = workspaceBody ?? match;
        else throw new Error(`Unexpected calendar request: ${path}`);
      }
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return {
    client,
    requests,
    setWorkspaceBody: (body: unknown) => {
      workspaceBody = body;
    },
    setSnapshot: (next: CalendarSnapshot) => {
      snapshot = next;
    },
    fail: (path?: string) => {
      failure = path;
    },
    wait: (pending?: Promise<void>) => {
      wait = pending;
    },
  };
}
