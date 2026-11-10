import { initServer } from '@ts-rest/express';

import { eventsContract } from '../../contract/events.js';
import {
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  updateEvent,
} from '../../db/services/events.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

/** Adapt independent event source operations to the published REST contract. */
export function makeEventHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof eventsContract>> {
  return server.router(eventsContract, {
    list: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { events: listEvents(db, params.tripId) },
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getEvent(db, params.tripId, params.id),
      })),
    create: ({ params, body }) =>
      withTripsErrors(() => ({ status: 201 as const, body: createEvent(db, params.tripId, body) })),
    update: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: updateEvent(db, params.tripId, params.id, body),
      })),
    delete: ({ params }) =>
      withTripsErrors(() => {
        deleteEvent(db, params.tripId, params.id);
        return { status: 204 as const, body: undefined };
      }),
  });
}
