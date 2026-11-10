import { initServer } from '@ts-rest/express';

import { decisionsContract, decisionOptionsContract } from '../../contract/decisions.js';
import {
  getDecision,
  getDecisionWorkspace,
  listDecisions,
  getDecisionOption,
  listDecisionOptions,
} from '../../db/services/decision-queries.js';
import {
  createDecision,
  updateDecision,
  deleteDecision,
  selectDecisionOption,
  createDecisionOption,
  updateDecisionOption,
  deleteDecisionOption,
  restoreDecisionOption,
} from '../../db/services/decisions.js';
import { withTripsErrors } from './with-errors.js';

import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();
/** Adapt revision-guarded source decisions and independent selection to REST. */
export function makeDecisionHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof decisionsContract>> {
  return server.router(decisionsContract, {
    workspace: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getDecisionWorkspace(db, params.tripId, params.id),
      })),
    list: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { decisions: listDecisions(db, params.tripId) },
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getDecision(db, params.tripId, params.id),
      })),
    create: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 201 as const,
        body: createDecision(db, params.tripId, body),
      })),
    update: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: updateDecision(db, params, body, body.expectedRevision),
      })),
    select: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: selectDecisionOption(db, params, body.optionId, body.expectedRevision),
      })),
    delete: ({ params, body }) =>
      withTripsErrors(() => {
        deleteDecision(db, params, body.expectedRevision);
        return { status: 204 as const, body: undefined };
      }),
  });
}
/** Adapt option writes guarded by their parent's aggregate revision to REST. */
export function makeDecisionOptionHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof decisionOptionsContract>> {
  return server.router(decisionOptionsContract, {
    list: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: { options: listDecisionOptions(db, params.tripId, params.decisionId) },
      })),
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: getDecisionOption(db, params.tripId, params.decisionId, params.id),
      })),
    create: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 201 as const,
        body: createDecisionOption(
          db,
          { tripId: params.tripId, id: params.decisionId },
          body,
          body.expectedRevision
        ),
      })),
    update: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: updateDecisionOption(db, params, body, body.expectedRevision),
      })),
    restore: ({ params, body }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: restoreDecisionOption(db, params, body.expectedRevision, body.select),
      })),
    delete: ({ params, body }) =>
      withTripsErrors(() => {
        deleteDecisionOption(db, params, body.expectedRevision);
        return { status: 204 as const, body: undefined };
      }),
  });
}
