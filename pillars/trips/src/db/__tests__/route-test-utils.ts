import { randomUUID } from 'node:crypto';

import { openTripsDb } from '../index.js';
import { createJourney } from '../services/journeys.js';
import { createPlace, createTrip, createVisit } from '../services/records.js';
import { operateTripRoute } from '../services/route-operations.js';
import { getTripRoute } from '../services/route-queries.js';

import type {
  RouteOperation,
  RouteOperationResult,
  RoutePath,
  TripRouteRead,
} from '../../contract/route-schemas.js';

/** Source fixture operations retain the actual aggregate revision and explicit numeric identities. */
export interface RouteFixture {
  opened: ReturnType<typeof openTripsDb>;
  db: ReturnType<typeof openTripsDb>['db'];
  trip: ReturnType<typeof createTrip>;
  other: ReturnType<typeof createTrip>;
  first: ReturnType<typeof createVisit>;
  second: ReturnType<typeof createVisit>;
  foreign: ReturnType<typeof createVisit>;
  journey: ReturnType<typeof createJourney>;
  read: () => TripRouteRead;
  run: (
    command: RouteOperation['command'],
    operationId?: string,
    expectedRevision?: number
  ) => RouteOperationResult;
  gap: () => { kind: 'gap'; id: number };
  path: (gapId: number, members: RoutePath['members'], title?: string) => RoutePath;
}

/** Real owned sources, including repeated towns and an independent foreign trip. */
export function routeFixture(): RouteFixture {
  const opened = openTripsDb(':memory:');
  const db = opened.db;
  const trip = createTrip(db, { name: 'Route source' });
  const other = createTrip(db, {});
  const place = createPlace(db, { name: 'Same town' });
  const first = createVisit(db, trip.id, {
    placeId: place.id,
    timing: { arrival: '2028-03-10', departure: '2028-03-11' },
  });
  const second = createVisit(db, trip.id, { placeId: place.id });
  const foreign = createVisit(db, other.id, { placeId: place.id });
  const journey = createJourney(db, trip.id, {
    name: 'Actual journey',
    sourceLinks: [{ uri: 'pops:documents/document/retained' }],
  });
  const read = (): TripRouteRead => getTripRoute(db, trip.id);
  const run = (
    command: RouteOperation['command'],
    operationId: string = randomUUID(),
    expectedRevision = read().revision
  ): RouteOperationResult =>
    operateTripRoute(db, trip.id, { operationId, expectedRevision, command });
  const gap = (): { kind: 'gap'; id: number } => {
    const result = run({ kind: 'gap.create', before: null });
    const item = result.current.order.at(-1);
    if (item?.kind !== 'gap') throw new Error('Expected persisted gap');
    return item;
  };
  const path = (
    gapId: number,
    members: RoutePath['members'],
    title = 'Explicit path'
  ): RoutePath => {
    const result = run({ kind: 'path.create', title, gapId, members });
    const created = result.current.paths.at(-1);
    if (created === undefined) throw new Error('Expected path');
    return created;
  };
  return { opened, db, trip, other, first, second, foreign, journey, read, run, gap, path };
}
/** Close the actual SQLite fixture even when a boundary assertion fails. */
export function withRouteFixture(run: (fixture: ReturnType<typeof routeFixture>) => void): void {
  const fixture = routeFixture();
  try {
    run(fixture);
  } finally {
    fixture.opened.raw.close();
  }
}
