import { randomUUID } from 'node:crypto';

import { routeGaps, routeOperations, routePaths } from '../schema.js';
import { operateRouteDraft } from '../services/route-draft-operations.js';
import {
  previewRouteDraftDeletion,
  readRouteDraftSnapshot,
} from '../services/route-draft-snapshot.js';

import type {
  RouteDraftCandidate,
  RouteDraftOperation,
  RouteDraftOperationResult,
  RouteDraftPreview,
  RouteDraftSource,
} from '../../contract/route-draft-schemas.js';
import type { RouteDraftSnapshot } from '../services/route-draft-snapshot.js';
import type { RouteFixture } from './route-test-utils.js';

type DraftState = {
  snapshot: RouteDraftSnapshot;
  operations: (typeof routeOperations.$inferSelect)[];
  paths: (typeof routePaths.$inferSelect)[];
  gaps: (typeof routeGaps.$inferSelect)[];
};

/** Bind a new UUID to the exact preview selection and revision, without refreshing its guards. */
export function deletionRequest(preview: RouteDraftPreview): RouteDraftOperation {
  return {
    operationId: randomUUID(),
    expectedRevision: preview.revision,
    command: {
      kind: 'path.delete',
      pathId: preview.pathId,
      expectedPreviewFingerprint: preview.fingerprint,
      deleteSources: preview.selection,
    },
  };
}

/** Preview and execute one deletion, optionally selecting independently owned related sources. */
export function deleteDraft(
  fixture: RouteFixture,
  pathId: number,
  deleteSources?: RouteDraftSource[]
): { preview: RouteDraftPreview; request: RouteDraftOperation; result: RouteDraftOperationResult } {
  const preview = previewRouteDraftDeletion(fixture.db, fixture.trip.id, pathId, {
    ...(deleteSources === undefined ? {} : { deleteSources }),
  });
  const request = deletionRequest(preview);
  return { preview, request, result: operateRouteDraft(fixture.db, fixture.trip.id, request) };
}

/** Capture raw lifecycle, relations, aggregate and allocated identities for atomicity assertions. */
export function draftState(fixture: RouteFixture): DraftState {
  return {
    snapshot: readRouteDraftSnapshot(fixture.db, fixture.trip.id),
    operations: fixture.db.select().from(routeOperations).all(),
    paths: fixture.db.select().from(routePaths).all(),
    gaps: fixture.db.select().from(routeGaps).all(),
  };
}

/** Resolve one typed candidate; a missing candidate is a test failure rather than an absent assertion. */
export function draftCandidate(
  preview: RouteDraftPreview,
  source: RouteDraftSource
): RouteDraftCandidate {
  const candidate = preview.candidates.find(
    (item) =>
      item.source.kind === source.kind &&
      item.source.id === source.id &&
      (item.source.kind !== 'journey-leg' ||
        (source.kind === 'journey-leg' && item.source.journeyId === source.journeyId))
  );
  if (candidate === undefined) throw new Error('Expected typed deletion candidate');
  return candidate;
}

/** Submit source-aware Undo against the current route revision with a new operation identity. */
export function undoDraft(
  fixture: RouteFixture,
  targetOperationId: string
): RouteDraftOperationResult {
  return operateRouteDraft(fixture.db, fixture.trip.id, {
    operationId: randomUUID(),
    expectedRevision: fixture.read().revision,
    command: { kind: 'undo', targetOperationId },
  });
}
