import { randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { createVisit, getVisit, updateVisit } from '../services/records.js';
import { operateTripRoute } from '../services/route-operations.js';
import { withRouteFixture } from './route-test-utils.js';

it('replays immutable outcomes after own LIFO Undo and restores the exact path/gap IDs without cloning sources', () => {
  withRouteFixture(({ first, second, read, run }) => {
    const initial = read();
    const gapCommand = { kind: 'gap.create', before: null } as const;
    const operationId = randomUUID();
    const gap = run(gapCommand, operationId, initial.revision);
    const anchor = gap.current.order.at(-1);
    if (anchor?.kind !== 'gap') throw new Error('Expected gap');
    const path = run({
      kind: 'path.create',
      title: 'Own path',
      gapId: anchor.id,
      members: [{ kind: 'visit', id: second.id }],
    });
    const pathId = path.current.paths[0]?.id;
    if (pathId === undefined) throw new Error('Expected path');
    const applied = run({ kind: 'path.apply', pathId });
    const undoApply = run({ kind: 'undo', targetOperationId: applied.receipt.operationId });
    expect(undoApply.current).toEqual({ ...path.current, revision: applied.current.revision + 1 });
    run({ kind: 'undo', targetOperationId: path.receipt.operationId });
    const undoGap = run({ kind: 'undo', targetOperationId: gap.receipt.operationId });
    expect(undoGap.current.order).toEqual([
      { kind: 'visit', id: first.id },
      { kind: 'visit', id: second.id },
    ]);
    expect(undoGap.current.paths).toEqual([]);
    const replay = run(gapCommand, operationId, initial.revision);
    expect(replay).toMatchObject({
      receipt: gap.receipt,
      current: undoGap.current,
      replayed: true,
      undone: true,
    });
    expect(() => run({ kind: 'undo', targetOperationId: undoGap.receipt.operationId })).toThrow(
      'route_undo_conflict'
    );
    expect(() => run({ kind: 'undo', targetOperationId: applied.receipt.operationId })).toThrow(
      'route_undo_conflict'
    );
    const next = run({ kind: 'gap.create', before: null }).current.order.at(-1);
    expect(next?.id).not.toBe(anchor.id);
  });
});

it('never treats a foreign identical route or a receipt from another trip as own Undo proof', () => {
  withRouteFixture(({ db, trip, other, read, run }) => {
    const own = run({ kind: 'gap.create', before: null });
    const original = own.current.order;
    run({ kind: 'route.reorder', order: original.toReversed() });
    run({ kind: 'route.reorder', order: original });
    const before = read();
    expect(() => run({ kind: 'undo', targetOperationId: own.receipt.operationId })).toThrow(
      'route_undo_conflict'
    );
    expect(read()).toEqual(before);
    expect(() =>
      operateTripRoute(db, other.id, {
        operationId: randomUUID(),
        expectedRevision: 1,
        command: { kind: 'undo', targetOperationId: own.receipt.operationId },
      })
    ).toThrow('route_undo_conflict');
    expect(read().tripId).toBe(trip.id);
  });
});

it('keeps independent source edits when undoing placement but refuses Undo across a newly appended Visit', () => {
  withRouteFixture(({ db, trip, first, read, run }) => {
    const own = run({ kind: 'gap.create', before: null });
    const changed = updateVisit(db, trip.id, first.id, { timing: { arrival: '2028-02-02' } });
    run({ kind: 'undo', targetOperationId: own.receipt.operationId });
    expect(getVisit(db, trip.id, first.id)).toEqual(changed);
    const secondOwn = run({ kind: 'gap.create', before: null });
    createVisit(db, trip.id, { placeId: first.placeId });
    const current = read();
    expect(() => run({ kind: 'undo', targetOperationId: secondOwn.receipt.operationId })).toThrow(
      'route_undo_conflict'
    );
    expect(read()).toEqual(current);
  });
});

it('detaches externally mutable requests and results from durable retry identity', () => {
  withRouteFixture(({ read, run }) => {
    const operationId = randomUUID();
    const expectedRevision = read().revision;
    const command = { kind: 'gap.create', before: null } as const;
    const own = run(command, operationId, expectedRevision);
    const receipt = structuredClone(own.receipt);
    own.receipt.after.order.length = 0;
    own.current.paths.push({
      id: 999,
      title: 'Foreign mutation',
      gapId: 999,
      state: 'applied',
      members: [],
    });
    const replay = run(command, operationId, expectedRevision);
    expect(replay.receipt).toEqual(receipt);
    expect(read().paths).toEqual([]);
  });
});
