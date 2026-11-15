import { isDeepStrictEqual } from 'node:util';

import {
  RouteDraftOperationSchema,
  RouteDraftReceiptSchema,
} from '../../contract/route-draft-schemas.js';
import { routeOperations } from '../schema/route.js';
import { applyRouteDraftEffects } from './route-draft-effects.js';
import { undoRouteDraft } from './route-draft-operation-undo.js';
import { planRouteDraftDeletion } from './route-draft-plan.js';
import {
  routeDraftFingerprint,
  routeDraftRecordRemoved,
  routeDraftRecordSource,
  routeDraftSourceKey,
} from './route-draft-records.js';
import { readRouteDraftSnapshot } from './route-draft-snapshot.js';
import { findRouteOperation } from './route-operation-records.js';
import { requireRouteRevision, writeRouteSnapshot } from './route-storage.js';
import { TripsServiceError } from './source-record.js';

import type {
  RouteDraftOperation,
  RouteDraftOperationResult,
  RouteDraftReceipt,
} from '../../contract/route-draft-schemas.js';
import type { TripsDb } from '../index.js';
import type { RouteDraftInverse } from './route-draft-effects.js';
import type { RouteDraftSnapshot } from './route-draft-snapshot.js';

function sourceState(
  record: RouteDraftSnapshot['records'][number] | undefined
): RouteDraftOperationResult['currentSources'][number]['state'] {
  if (record === undefined) return 'missing';
  if (routeDraftRecordRemoved(record)) return 'removed';
  return 'active';
}

function currentSources(
  snapshot: RouteDraftSnapshot,
  receipt: RouteDraftReceipt
): RouteDraftOperationResult['currentSources'] {
  return receipt.deletion.candidates.map((candidate) => {
    const record = snapshot.records.find(
      (entry) =>
        routeDraftSourceKey(routeDraftRecordSource(entry)) === routeDraftSourceKey(candidate.source)
    );
    return {
      source: candidate.source,
      state: sourceState(record),
      version: record === undefined ? null : routeDraftFingerprint(record),
    };
  });
}

function replay(
  db: TripsDb,
  snapshot: RouteDraftSnapshot,
  operation: RouteDraftOperation,
  prior: typeof routeOperations.$inferSelect
): RouteDraftOperationResult {
  if (prior.family !== 'draft' || !isDeepStrictEqual(prior.request, operation))
    throw new TripsServiceError('route_operation_mismatch');
  if (operation.command.kind === 'undo') {
    const target = findRouteOperation(
      db,
      snapshot.route.tripId,
      operation.command.targetOperationId
    );
    if (target?.family !== 'draft' || target.request.command.kind !== 'path.delete')
      throw new TripsServiceError('route_draft_undo_conflict');
  }
  const receipt = RouteDraftReceiptSchema.parse(prior.receipt);
  return {
    receipt,
    current: snapshot.route,
    currentSources: currentSources(snapshot, receipt),
    undone: prior.undoneBy !== null,
    replayed: true,
  };
}

function remove(
  db: TripsDb,
  snapshot: RouteDraftSnapshot,
  operation: RouteDraftOperation
): { receipt: RouteDraftReceipt; inverse: RouteDraftInverse } {
  if (operation.command.kind !== 'path.delete') throw new TripsServiceError('route_draft_conflict');
  const command = operation.command;
  const preview = planRouteDraftDeletion(snapshot, command.pathId, {
    deleteSources: command.deleteSources,
  });
  if (preview.fingerprint !== command.expectedPreviewFingerprint)
    throw new TripsServiceError('route_draft_conflict');
  const inverse = applyRouteDraftEffects(db, snapshot, preview, operation.operationId);
  const after = {
    ...snapshot.route,
    revision: snapshot.route.revision + 1,
    paths: snapshot.route.paths.filter((path) => path.id !== command.pathId),
  };
  return {
    receipt: {
      operationId: operation.operationId,
      undoneOperationId: null,
      before: snapshot.route,
      after,
      deletion: {
        pathId: command.pathId,
        fingerprint: preview.fingerprint,
        candidates: preview.candidates,
      },
    },
    inverse,
  };
}

/** Atomically delete an explicit alternative and eligible sources, or replay/Undo only its own scoped durable outcome. */
export function operateRouteDraft(
  db: TripsDb,
  tripId: number,
  input: RouteDraftOperation
): RouteDraftOperationResult {
  const operation = RouteDraftOperationSchema.parse(JSON.parse(JSON.stringify(input)));
  return db.transaction(
    (tx) => {
      const snapshot = readRouteDraftSnapshot(tx, tripId);
      const prior = findRouteOperation(tx, tripId, operation.operationId);
      if (prior !== undefined) return replay(tx, snapshot, operation, prior);
      requireRouteRevision(snapshot.route, operation.expectedRevision);
      const outcome =
        operation.command.kind === 'path.delete'
          ? remove(tx, snapshot, operation)
          : undoRouteDraft(tx, snapshot, operation);
      writeRouteSnapshot(tx, outcome.receipt.after);
      tx.insert(routeOperations)
        .values({
          tripId,
          operationId: operation.operationId,
          family: 'draft',
          request: operation,
          receipt: outcome.receipt,
          sourceInverse: outcome.inverse,
          expectedAfter: outcome.receipt.after,
        })
        .run();
      const current = readRouteDraftSnapshot(tx, tripId);
      return {
        receipt: outcome.receipt,
        current: current.route,
        currentSources: currentSources(current, outcome.receipt),
        undone: false,
        replayed: false,
      };
    },
    { behavior: 'immediate' }
  );
}
