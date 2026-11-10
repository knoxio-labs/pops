import { randomUUID } from 'node:crypto';

import { openTripsDb } from '../index.js';
import { operateMeetingPlan } from '../services/meeting-plans.js';
import { createPlace, createTrip, createVisit } from '../services/records.js';

import type {
  MeetingPlanOperation,
  MeetingPlanOperationResult,
  MeetingPlanPatch,
} from '../../contract/meeting-plan-schemas.js';

/** Source test fixture with only explicitly owned source operations. */
export interface MeetingFixture {
  opened: ReturnType<typeof openTripsDb>;
  db: ReturnType<typeof openTripsDb>['db'];
  trip: ReturnType<typeof createTrip>;
  other: ReturnType<typeof createTrip>;
  first: ReturnType<typeof createVisit>;
  second: ReturnType<typeof createVisit>;
  foreign: ReturnType<typeof createVisit>;
  run: (command: MeetingPlanOperation['command'], canonical?: string) => MeetingPlanOperationResult;
  create: (patch?: Omit<MeetingPlanPatch, 'contactUri'>) => MeetingPlanOperationResult;
}

/** Real migrated SQLite fixture with repeated towns and a separate owning trip. */
export function meetingFixture(): MeetingFixture {
  const opened = openTripsDb(':memory:');
  const db = opened.db;
  const trip = createTrip(db, {});
  const other = createTrip(db, {});
  const place = createPlace(db, { name: 'Same town' });
  const first = createVisit(db, trip.id, { placeId: place.id });
  const second = createVisit(db, trip.id, { placeId: place.id });
  const foreign = createVisit(db, other.id, { placeId: place.id });
  const run = (
    command: MeetingPlanOperation['command'],
    canonical?: string
  ): MeetingPlanOperationResult =>
    operateMeetingPlan(db, trip.id, { operationId: randomUUID(), command }, canonical);
  const create = (patch: Omit<MeetingPlanPatch, 'contactUri'> = {}): MeetingPlanOperationResult =>
    run(
      { kind: 'create', input: { contactUri: 'pops:contacts/contact/old', ...patch } },
      'pops:contacts/contact/canonical'
    );
  return { opened, db, trip, other, first, second, foreign, run, create };
}
