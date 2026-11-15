import { randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { getVisit, updateVisit } from '../services/records.js';
import { operateRouteDraft } from '../services/route-draft-operations.js';
import { previewRouteDraftDeletion } from '../services/route-draft-snapshot.js';
import { operateTripRoute } from '../services/route-operations.js';
import { getTripRoute } from '../services/route-queries.js';
import { deleteDraft, deletionRequest, draftState, undoDraft } from './route-draft-test-utils.js';
import { withRouteFixture } from './route-test-utils.js';

it('replays a lost response without requiring the deleted path and reports later current state separately', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, second, gap, path, read } = fixture;
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { request, result } = deleteDraft(fixture, draft.id);
    const originalReceipt = structuredClone(result.receipt);
    const changed = updateVisit(db, trip.id, second.id, {
      notes: 'Independent change after acknowledgement was lost',
    });
    const before = draftState(fixture);
    const replay = operateRouteDraft(db, trip.id, request);
    expect(replay).toMatchObject({
      receipt: originalReceipt,
      replayed: true,
      undone: false,
      current: result.current,
    });
    expect(replay.currentSources).toContainEqual(
      expect.objectContaining({ source: { kind: 'visit', id: first.id }, state: 'removed' })
    );
    expect(draftState(fixture)).toEqual(before);
    expect(getVisit(db, trip.id, second.id)).toEqual(changed);
    expect(read().paths).toEqual([]);
  });
});

it('pins every UUID payload field and refuses a new UUID for an already removed draft', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, gap, path } = fixture;
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { request } = deleteDraft(fixture, draft.id);
    if (request.command.kind !== 'path.delete') throw new Error('Expected deletion request');
    const command = request.command;
    const variants = [
      { ...request, expectedRevision: request.expectedRevision + 1 },
      { ...request, command: { ...command, pathId: command.pathId + 1 } },
      { ...request, command: { ...command, expectedPreviewFingerprint: '0'.repeat(64) } },
      { ...request, command: { ...command, deleteSources: [] } },
    ];
    const before = draftState(fixture);
    for (const variant of variants) {
      expect(() => operateRouteDraft(db, trip.id, variant)).toThrow('route_operation_mismatch');
      expect(draftState(fixture)).toEqual(before);
    }
    expect(() =>
      operateRouteDraft(db, trip.id, {
        ...request,
        operationId: randomUUID(),
        expectedRevision: fixture.read().revision,
      })
    ).toThrow('not_found');
    expect(draftState(fixture)).toEqual(before);
  });
});

it('replays delete and Undo receipts without resurrection or a second lifecycle transition', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, gap, path } = fixture;
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { request, result } = deleteDraft(fixture, draft.id);
    const undoRequest = {
      operationId: randomUUID(),
      expectedRevision: result.current.revision,
      command: { kind: 'undo', targetOperationId: result.receipt.operationId },
    } as const;
    const undone = operateRouteDraft(db, trip.id, undoRequest);
    const before = draftState(fixture);
    expect(operateRouteDraft(db, trip.id, request)).toMatchObject({
      receipt: result.receipt,
      current: undone.current,
      replayed: true,
      undone: true,
    });
    expect(operateRouteDraft(db, trip.id, undoRequest)).toEqual({ ...undone, replayed: true });
    expect(draftState(fixture)).toEqual(before);
    expect(getVisit(db, trip.id, first.id).id).toBe(first.id);
    expect(() => undoDraft(fixture, undone.receipt.operationId)).toThrow(
      'route_draft_undo_conflict'
    );
    expect(() => undoDraft(fixture, result.receipt.operationId)).toThrow(
      'route_draft_undo_conflict'
    );
    expect(draftState(fixture)).toEqual(before);
  });
});

it('rejects generic placement Undo and UUID replay against draft receipts, including an already completed draft Undo', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, gap, path, run } = fixture;
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { request, result } = deleteDraft(fixture, draft.id);
    let before = draftState(fixture);
    expect(() => run({ kind: 'undo', targetOperationId: result.receipt.operationId })).toThrow(
      'route_undo_conflict'
    );
    expect(() =>
      run({ kind: 'gap.create', before: null }, request.operationId, request.expectedRevision)
    ).toThrow('route_operation_mismatch');
    expect(draftState(fixture)).toEqual(before);
    const undone = undoDraft(fixture, result.receipt.operationId);
    before = draftState(fixture);
    expect(() =>
      operateTripRoute(db, trip.id, {
        operationId: undone.receipt.operationId,
        expectedRevision: undone.receipt.before.revision,
        command: { kind: 'undo', targetOperationId: result.receipt.operationId },
      })
    ).toThrow('route_operation_mismatch');
    expect(draftState(fixture)).toEqual(before);
  });
});

it('rejects draft-family reuse or Undo of placement receipts and receipts from another trip', () => {
  withRouteFixture((fixture) => {
    const { db, trip, other, first, gap, path, run, read } = fixture;
    const anchor = gap();
    const draft = path(anchor.id, [{ kind: 'visit', id: first.id }]);
    const placement = run({ kind: 'gap.create', before: null });
    const request = deletionRequest(previewRouteDraftDeletion(db, trip.id, draft.id, {}));
    const before = draftState(fixture);
    expect(() =>
      operateRouteDraft(db, trip.id, { ...request, operationId: placement.receipt.operationId })
    ).toThrow('route_operation_mismatch');
    expect(() => undoDraft(fixture, placement.receipt.operationId)).toThrow(
      'route_draft_undo_conflict'
    );
    expect(draftState(fixture)).toEqual(before);
    const removed = operateRouteDraft(db, trip.id, request);
    expect(() =>
      operateRouteDraft(db, other.id, {
        operationId: randomUUID(),
        expectedRevision: getTripRoute(db, other.id).revision,
        command: { kind: 'undo', targetOperationId: removed.receipt.operationId },
      })
    ).toThrow('route_draft_undo_conflict');
    expect(read()).toMatchObject(removed.current);
  });
});

it('accepts only the first of two independent UUIDs using the same preview and keeps its retry valid', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, gap, path } = fixture;
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const request = deletionRequest(previewRouteDraftDeletion(db, trip.id, draft.id, {}));
    const removed = operateRouteDraft(db, trip.id, request);
    const before = draftState(fixture);
    expect(() => operateRouteDraft(db, trip.id, { ...request, operationId: randomUUID() })).toThrow(
      'route_revision_conflict'
    );
    expect(operateRouteDraft(db, trip.id, request)).toEqual({ ...removed, replayed: true });
    expect(draftState(fixture)).toEqual(before);
  });
});

it('does not let a caller mutate durable retry proof through a request or response object', () => {
  withRouteFixture((fixture) => {
    const { db, trip, first, gap, path } = fixture;
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    const { request, result } = deleteDraft(fixture, draft.id);
    const originalRequest = structuredClone(request);
    const originalReceipt = structuredClone(result.receipt);
    if (request.command.kind !== 'path.delete') throw new Error('Expected deletion request');
    request.command.deleteSources.length = 0;
    result.receipt.deletion.candidates.length = 0;
    result.receipt.before.paths.length = 0;
    const replay = operateRouteDraft(db, trip.id, originalRequest);
    expect(replay.receipt).toEqual(originalReceipt);
    expect(replay.replayed).toBe(true);
  });
});
