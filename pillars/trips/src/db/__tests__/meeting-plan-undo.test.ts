import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getMeetingPlan, listMeetingPlans } from '../services/meeting-plan-queries.js';
import { operateMeetingPlan } from '../services/meeting-plans.js';
import { meetingFixture } from './meeting-plan-fixture.js';

import type { MeetingPlanOperation } from '../../contract/meeting-plan-schemas.js';

describe('Confirmed meeting operations and own Undo lineage', () => {
  let f: ReturnType<typeof meetingFixture>;
  beforeEach(() => {
    f = meetingFixture();
  });
  afterEach(() => {
    f.opened.raw.close();
  });

  it('replays immutable historical outcomes and rejects mismatched operation identity', () => {
    const operation: MeetingPlanOperation = {
      operationId: randomUUID(),
      command: { kind: 'create', input: { contactUri: 'pops:contacts/contact/old' } },
    };
    const result = operateMeetingPlan(
      f.db,
      f.trip.id,
      operation,
      'pops:contacts/contact/canonical'
    );
    const current = f.run({
      kind: 'update',
      id: result.current.id,
      expectedRevision: 1,
      patch: { notes: 'Later' },
    }).current;
    expect(operateMeetingPlan(f.db, f.trip.id, operation)).toEqual({
      receipt: result.receipt,
      current,
      undone: false,
      replayed: true,
    });
    expect(() =>
      operateMeetingPlan(f.db, f.trip.id, {
        ...operation,
        command: { kind: 'create', input: { contactUri: 'pops:contacts/contact/other' } },
      })
    ).toThrow('meeting_operation_mismatch');
    expect(listMeetingPlans(f.db, f.trip.id)).toEqual([current]);
  });

  it('supports proven LIFO Undo without changing historical receipts', () => {
    const created = f.create();
    const edit = f.run({
      kind: 'update',
      id: created.current.id,
      expectedRevision: 1,
      patch: { notes: 'Changed', agreement: 'Agreed' },
    });
    const removed = f.run({
      kind: 'remove',
      id: created.current.id,
      expectedRevision: edit.current.revision,
    });
    expect(listMeetingPlans(f.db, f.trip.id)).toEqual([]);
    const restored = f.run({ kind: 'undo', targetOperationId: removed.receipt.operationId });
    expect(restored.current).toMatchObject({ removed: false, notes: 'Changed', revision: 4 });
    const unedited = f.run({ kind: 'undo', targetOperationId: edit.receipt.operationId });
    expect(unedited.current).toMatchObject({ notes: '', agreement: 'Not agreed', revision: 5 });
    const uncreated = f.run({ kind: 'undo', targetOperationId: created.receipt.operationId });
    expect(uncreated.current).toMatchObject({ removed: true, revision: 6 });
    expect(() => getMeetingPlan(f.db, f.trip.id, created.current.id)).toThrow('not_found');
    const replay = operateMeetingPlan(f.db, f.trip.id, {
      operationId: created.receipt.operationId,
      command: { kind: 'create', input: { contactUri: 'pops:contacts/contact/old' } },
    });
    expect(replay.receipt).toEqual(created.receipt);
    expect(replay).toMatchObject({ undone: true, replayed: true, current: { revision: 6 } });
  });

  it('cannot borrow a foreign source revision or undo an Undo/foreign-trip receipt', () => {
    const created = f.create();
    const edit = f.run({
      kind: 'update',
      id: created.current.id,
      expectedRevision: 1,
      patch: { notes: 'Same' },
    });
    const foreign = f.run({
      kind: 'update',
      id: created.current.id,
      expectedRevision: 2,
      patch: { notes: '' },
    });
    expect(() => f.run({ kind: 'undo', targetOperationId: created.receipt.operationId })).toThrow(
      'meeting_undo_conflict'
    );
    expect(() => f.run({ kind: 'undo', targetOperationId: edit.receipt.operationId })).toThrow(
      'meeting_undo_conflict'
    );
    expect(() =>
      operateMeetingPlan(f.db, f.other.id, {
        operationId: randomUUID(),
        command: { kind: 'undo', targetOperationId: foreign.receipt.operationId },
      })
    ).toThrow('meeting_undo_conflict');
    const undone = f.run({ kind: 'undo', targetOperationId: foreign.receipt.operationId });
    expect(() => f.run({ kind: 'undo', targetOperationId: undone.receipt.operationId })).toThrow(
      'meeting_undo_conflict'
    );
    expect(() => f.run({ kind: 'undo', targetOperationId: foreign.receipt.operationId })).toThrow(
      'meeting_undo_conflict'
    );
  });
});
