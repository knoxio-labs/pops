import { initServer } from '@ts-rest/express';

import {
  capturesContract,
  ideasContract,
  exploreContract,
  captureWorkspaceContract,
} from '../../contract/source-workspace.js';
import {
  operateSourceWorkspace,
  CAPTURE_COMMANDS,
  IDEA_COMMANDS,
  EXPLORE_COMMANDS,
} from '../../db/services/source-operations.js';
import { readSourceWorkspace } from '../../db/services/source-queries.js';
import { withTripsErrors } from './with-errors.js';

import type { SourceOperation, SourceCommand } from '../../contract/source-workspace.js';
import type { TripsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

function action(db: TripsDb, allowedKinds: readonly SourceCommand['kind'][]) {
  return ({ params, body }: { params: { tripId: number }; body: SourceOperation }) =>
    withTripsErrors(() => ({
      status: 200 as const,
      body: operateSourceWorkspace(db, params.tripId, body, allowedKinds),
    }));
}
/** Adapt individually scoped capture actions to the atomic operation engine. */
export function makeCaptureHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof capturesContract>> {
  return server.router(capturesContract, {
    create: action(db, ['capture.create']),
    update: action(db, ['capture.update']),
    attach: action(db, ['capture.attach']),
    remove: action(db, ['capture.remove']),
    organise: action(db, ['capture.organise']),
    removeAssociation: action(db, ['association.remove']),
    undo: action(db, CAPTURE_COMMANDS),
  });
}
/** Adapt individually scoped Idea actions; Undo cannot reach capture or membership operations. */
export function makeIdeaHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof ideasContract>> {
  return server.router(ideasContract, {
    create: action(db, ['idea.create']),
    update: action(db, ['idea.update']),
    remove: action(db, ['idea.remove']),
    undo: action(db, IDEA_COMMANDS),
  });
}
/** Adapt collection membership actions without transferring ownership of their sources. */
export function makeExploreHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof exploreContract>> {
  return server.router(exploreContract, {
    add: action(db, ['explore.add']),
    remove: action(db, ['explore.remove']),
    undo: action(db, EXPLORE_COMMANDS),
  });
}
/** Read a consistent capture, Idea, association, membership and local target snapshot. */
export function makeCaptureWorkspaceHandlers(
  db: TripsDb
): ReturnType<typeof server.router<typeof captureWorkspaceContract>> {
  return server.router(captureWorkspaceContract, {
    get: ({ params }) =>
      withTripsErrors(() => ({
        status: 200 as const,
        body: readSourceWorkspace(db, params.tripId),
      })),
  });
}
