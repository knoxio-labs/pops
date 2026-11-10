import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { PeopleEditor } from './editor';
import { meetingPlan, meetingResult } from './test-utils';

import type { MeetingOperation, MeetingResult } from './types';

describe('confirmed meeting operations', () => {
  it('retains the observed revision while a field is dirty and never silently rebases its pending edit', async () => {
    const apply = vi.fn(async (operation: MeetingOperation) =>
      meetingResult(operation, meetingPlan(), meetingPlan({ revision: 2, title: 'Draft' }))
    );
    const editor = new PeopleEditor([meetingPlan()], apply);
    editor.setDirty('41:title', true);
    editor.refresh([meetingPlan({ revision: 8, title: 'Foreign edit' })]);
    expect(editor.snapshot().plans[0]?.revision).toBe(1);
    await editor.run({ kind: 'update', id: 41, expectedRevision: 1, patch: { title: 'Draft' } });
    expect(apply.mock.calls[0]?.[0].command).toMatchObject({ expectedRevision: 1 });
    expect(editor.snapshot().canUndo).toBe(false);
    editor.setDirty('41:title', false);
    expect(editor.snapshot().canUndo).toBe(true);
  });
  it('retains exact uncertain create operation and fences subsequent writes and reload', async () => {
    const apply = vi
      .fn<(operation: MeetingOperation) => Promise<MeetingResult>>()
      .mockRejectedValueOnce(new Error('disconnected'));
    const editor = new PeopleEditor([], apply);
    await editor.run({ kind: 'create', input: { contactUri: 'pops:contacts/contact/issued' } });
    const operation = editor.snapshot().failure?.operation;
    expect(operation?.operationId).toMatch(/^[\da-f-]{36}$/u);
    editor.reload([]);
    await editor.run({ kind: 'create', input: { contactUri: 'pops:contacts/contact/other' } });
    expect(apply).toHaveBeenCalledTimes(1);
    if (!operation) throw new Error('Expected retained operation');
    const response = meetingResult(operation, null, meetingPlan());
    apply.mockResolvedValueOnce({ ...response, replayed: true });
    await editor.retry();
    expect(apply.mock.calls[1]?.[0]).toBe(operation);
    expect(editor.snapshot()).toMatchObject({
      plans: [response.current],
      canUndo: true,
      failure: null,
    });
  });

  it('offers no inverse for replay whose current source has changed or already been undone', async () => {
    const apply = vi.fn(async (operation: MeetingOperation) => ({
      ...meetingResult(operation, null, meetingPlan()),
      current: meetingPlan({ revision: 3 }),
      replayed: true,
    }));
    const editor = new PeopleEditor([], apply);
    await editor.run({ kind: 'create', input: { contactUri: 'pops:contacts/contact/issued' } });
    expect(editor.snapshot().canUndo).toBe(false);
    await editor.undo();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('targets confirmed own receipts in LIFO order after successful Undo', async () => {
    const first = meetingPlan();
    const second = meetingPlan({ revision: 2, title: 'Lunch' });
    const restored = meetingPlan({ revision: 3 });
    const apply = vi.fn<(operation: MeetingOperation) => Promise<MeetingResult>>();
    apply.mockImplementationOnce(async (operation) => meetingResult(operation, null, first));
    apply.mockImplementationOnce(async (operation) => meetingResult(operation, first, second));
    apply.mockImplementationOnce(async (operation) => meetingResult(operation, second, restored));
    const editor = new PeopleEditor([], apply);
    await editor.run({ kind: 'create', input: { contactUri: first.contactUri! } });
    await editor.run({
      kind: 'update',
      id: first.id,
      expectedRevision: first.revision,
      patch: { title: 'Lunch' },
    });
    await editor.undo();
    expect(apply.mock.calls[2]?.[0].command).toEqual({
      kind: 'undo',
      targetOperationId: apply.mock.calls[1]?.[0].operationId,
    });
    apply.mockImplementationOnce(async (operation) =>
      meetingResult(operation, restored, { ...restored, removed: true, revision: 4 })
    );
    await editor.undo();
    expect(apply.mock.calls[3]?.[0].command).toEqual({
      kind: 'undo',
      targetOperationId: apply.mock.calls[0]?.[0].operationId,
    });
    expect(editor.snapshot().canUndo).toBe(false);
  });

  it('does not borrow a foreign revision for inverse or failed edit retry', async () => {
    const apply = vi.fn(async (operation: MeetingOperation) =>
      meetingResult(operation, null, meetingPlan())
    );
    const editor = new PeopleEditor([], apply);
    await editor.run({ kind: 'create', input: { contactUri: 'pops:contacts/contact/issued' } });
    editor.refresh([meetingPlan({ revision: 9 })]);
    expect(editor.snapshot().canUndo).toBe(false);
    apply.mockRejectedValueOnce(new Error('offline'));
    await editor.run({
      kind: 'update',
      id: 41,
      expectedRevision: 9,
      patch: { startDate: '2030-02-01' },
    });
    editor.refresh([meetingPlan({ revision: 10 })]);
    apply.mockRejectedValueOnce(new Error('offline'));
    await editor.retry();
    expect(apply.mock.calls.at(-1)?.[0].command).toMatchObject({ expectedRevision: 9 });
  });

  it('clears stale history on revision conflict and requires explicit successful reload', async () => {
    const apply = vi.fn(async (operation: MeetingOperation) =>
      meetingResult(operation, null, meetingPlan())
    );
    const editor = new PeopleEditor([], apply);
    await editor.run({ kind: 'create', input: { contactUri: 'pops:contacts/contact/issued' } });
    apply.mockRejectedValueOnce(
      new ApiError('changed', 409, 'trips.meeting_plan.meeting_revision_conflict')
    );
    await editor.run({
      kind: 'update',
      id: 41,
      expectedRevision: 1,
      patch: { agreement: 'Agreed' },
    });
    expect(editor.snapshot().canUndo).toBe(false);
    editor.refresh([meetingPlan({ revision: 2 })]);
    expect(editor.snapshot().failure).not.toBeNull();
    editor.reload([meetingPlan({ revision: 2 })]);
    expect(editor.snapshot()).toMatchObject({
      failure: null,
      plans: [meetingPlan({ revision: 2 })],
      canUndo: false,
    });
  });
});
