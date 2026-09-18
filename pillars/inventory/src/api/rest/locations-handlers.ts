import { randomUUID } from 'node:crypto';

import { LocationNotFoundError, type InventoryDb, locationsService } from '../../db/index.js';
import { toLocation } from '../modules/locations/types.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { runLegacyMutation } from './command-bridge.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryLocationsContract } from '../../contract/rest-locations.js';
import type { Location, LocationRow } from '../../db/index.js';
import type { Outcome } from '../../domain/commands/index.js';
import type { LegacyMutationRequest } from './command-bridge.js';

type Req = ServerInferRequest<typeof inventoryLocationsContract>;

/** Translate the db package's `LocationNotFoundError` (thrown by every locations-queries read) into the shared 404. */
function or404<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof LocationNotFoundError) throw new NotFoundError('Location', err.id);
    throw err;
  }
}

/** Get a location by id, translating a miss into the shared 404. */
function getLocationOr404(db: InventoryDb, id: string): LocationRow {
  return or404(() => locationsService.getLocation(db, id));
}

/**
 * Throw the `HttpError` a legacy `/locations` caller expects for a command
 * outcome that did not apply. `target` names the reference a
 * `target_missing` rejection refused.
 */
function throwForLocationOutcome(outcome: Outcome, targetId?: string): never {
  if (outcome.status === 'rejected') {
    if (outcome.reason === 'target_missing') {
      throw new NotFoundError('Parent location', targetId ?? outcome.message);
    }
    if (outcome.reason === 'cycle') {
      throw new ConflictError('Moving this location would create a circular reference');
    }
    throw new ValidationError(outcome.message);
  }
  if (outcome.status === 'conflict') throw new ConflictError(`conflict: ${outcome.kind}`);
  throw new Error(`unexpected ${outcome.status} outcome for a synchronous legacy mutation`);
}

/** A legacy location mutation, plus the parent id to name if it is refused. */
interface LocationMutationRequest extends LegacyMutationRequest {
  readonly targetId?: string;
}

/** Run a legacy location mutation, throwing the mapped `HttpError` when it did not apply. */
function applyLocationMutation(db: InventoryDb, request: LocationMutationRequest): void {
  const outcome = runLegacyMutation(db, request);
  if (outcome.status !== 'applied') throwForLocationOutcome(outcome, request.targetId);
}

function handleCreate(db: InventoryDb, body: Req['create']['body']): Location {
  const id = randomUUID();
  applyLocationMutation(db, {
    op: 'location.create',
    entityId: id,
    args: {
      location: { name: body.name, parentId: body.parentId ?? null, sortOrder: body.sortOrder },
    },
    baseRevision: null,
    targetId: body.parentId ?? undefined,
  });
  return toLocation(getLocationOr404(db, id));
}

function handleUpdate(db: InventoryDb, id: string, body: Req['update']['body']): Location {
  const current = getLocationOr404(db, id);
  if (body.name !== undefined || body.sortOrder !== undefined) {
    applyLocationMutation(db, {
      op: 'location.rename',
      entityId: id,
      args: { name: body.name, sortOrder: body.sortOrder },
      baseRevision: current.revision,
    });
  }
  if (body.parentId !== undefined) {
    const refreshed = getLocationOr404(db, id);
    applyLocationMutation(db, {
      op: 'location.move',
      entityId: id,
      args: { parentId: body.parentId },
      baseRevision: refreshed.revision,
      targetId: body.parentId ?? undefined,
    });
  }
  return toLocation(getLocationOr404(db, id));
}

function handleDelete(
  db: InventoryDb,
  id: string,
  force: boolean | undefined
):
  | { message: string }
  | { requiresConfirmation: true; stats: ReturnType<typeof locationsService.getDeleteStats> } {
  const current: LocationRow = getLocationOr404(db, id);
  if (force !== true) {
    const stats = locationsService.getDeleteStats(db, id);
    if (stats.childCount > 0 || stats.itemCount > 0) return { requiresConfirmation: true, stats };
  }
  applyLocationMutation(db, {
    op: 'location.delete',
    entityId: id,
    args: {},
    baseRevision: current.revision,
  });
  return { message: 'Location deleted' };
}

/**
 * Handlers for the `locations.*` sub-router. Reads stay thin pass-throughs
 * to `locationsService`; every write goes through the command engine
 * (POPS-4053), recorded against actor `web`, with the legacy response shape
 * unchanged.
 */
export function makeLocationsHandlers(db: InventoryDb) {
  return {
    list: () =>
      runHttp(() => {
        const { rows, total } = locationsService.listLocations(db);
        return { status: 200 as const, body: { data: rows.map(toLocation), total } };
      }),

    tree: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: locationsService.getLocationTree(db) },
      })),

    get: ({ params }: Req['get']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: toLocation(getLocationOr404(db, params.id)) },
      })),

    getPath: ({ params }: Req['getPath']) =>
      runHttp(() => {
        const rows = or404(() => locationsService.getLocationPath(db, params.id));
        return { status: 200 as const, body: { data: rows.map(toLocation) } };
      }),

    children: ({ params }: Req['children']) =>
      runHttp(() => {
        const rows = locationsService.getChildren(db, params.id);
        return { status: 200 as const, body: { data: rows.map(toLocation) } };
      }),

    deleteStats: ({ params }: Req['deleteStats']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: or404(() => locationsService.getDeleteStats(db, params.id)) },
      })),

    create: ({ body }: Req['create']) =>
      runHttp(() => ({
        status: 201 as const,
        body: { data: handleCreate(db, body), message: 'Location created' },
      })),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: handleUpdate(db, params.id, body), message: 'Location updated' },
      })),

    delete: ({ params, query }: Req['delete']) =>
      runHttp(() => ({ status: 200 as const, body: handleDelete(db, params.id, query.force) })),
  };
}
