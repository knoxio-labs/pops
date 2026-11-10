import { initServer } from '@ts-rest/express';

import { meetingPlansContract } from '../../contract/meeting-plans.js';
import {
  getMeetingPlan,
  listMeetingPlans,
  replayMeetingPlanOperation,
} from '../../db/services/meeting-plan-queries.js';
import { operateMeetingPlan } from '../../db/services/meeting-plans.js';
import { getTrip } from '../../db/services/records.js';
import { prepareMeetingContact } from './meeting-plan-contact.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsApiDeps } from '../handlers.js';

const server: ReturnType<typeof initServer> = initServer();
/** Adapt replayable meeting operations; external verification happens before the atomic source CAS is rechecked. */
export function makeMeetingPlanHandlers(
  deps: TripsApiDeps
): ReturnType<typeof server.router<typeof meetingPlansContract>> {
  const db = deps.tripsDb.db;
  return server.router(meetingPlansContract, {
    list: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { meetingPlans: listMeetingPlans(db, params.tripId) },
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getMeetingPlan(db, params.tripId, params.id),
      })),
    operate: ({ params, body }) =>
      withTripsErrors(async () => {
        getTrip(db, params.tripId);
        const replay = db.transaction((tx) => replayMeetingPlanOperation(tx, params.tripId, body));
        if (replay !== undefined) return { status: 200 as const, body: replay };
        const resolved = await prepareMeetingContact(
          db,
          params.tripId,
          body,
          deps.resolveMeetingContact
        );
        return {
          status: 200 as const,
          body: operateMeetingPlan(db, params.tripId, body, resolved),
        };
      }),
  });
}
