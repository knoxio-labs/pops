import { expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { createDecisionEditor } from './editor';
import { sourceDecision } from './test-utils';

import type { DecisionPerformer } from './editor-types';
import type { AppliedDecisionChange } from './types';

const edit = { kind: 'edit-decision' as const, fields: { question: 'New question' } };
function success(revision: number): AppliedDecisionChange {
  return {
    source: sourceDecision(revision),
    inverse: { kind: 'edit-decision', fields: { question: 'Which departure?' } },
  };
}
it('serializes writes and lends Undo only the confirmed own successor revision', async () => {
  let resolve: (result: AppliedDecisionChange) => void = () => {
    throw new Error('not started');
  };
  const perform = vi
    .fn<DecisionPerformer>()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    )
    .mockResolvedValueOnce(success(2));
  const editor = createDecisionEditor(sourceDecision(), perform);
  const pending = editor.commit(edit, 'Edit');
  expect(editor.getState().busy).toBe(true);
  expect(await editor.commit(edit, 'Edit')).toBe(false);
  resolve(success(1));
  expect(await pending).toBe(true);
  expect(editor.getState().undoCount).toBe(1);
  expect(await editor.undo()).toBe(true);
  expect(perform.mock.calls[1]?.[0].decision.revision).toBe(1);
  expect(editor.getState().undoCount).toBe(0);
});
it('clears Undo for another writer and preserves dirty source until explicit review', async () => {
  const perform = vi.fn<DecisionPerformer>().mockResolvedValueOnce(success(1));
  const editor = createDecisionEditor(sourceDecision(), perform);
  await editor.commit(edit, 'Edit');
  editor.setDirty('question', true);
  editor.receive(sourceDecision(3));
  expect(editor.getState()).toMatchObject({
    conflict: true,
    undoCount: 0,
    source: { decision: { revision: 1 } },
  });
  expect(await editor.undo()).toBe(false);
  expect(await editor.commit(edit, 'Edit')).toBe(false);
  editor.reload(sourceDecision(2));
  expect(editor.getState()).toMatchObject({
    conflict: false,
    source: { decision: { revision: 3 } },
  });
  editor.receive(sourceDecision(1));
  expect(editor.getState().source.decision.revision).toBe(3);
});
it('retains failed intent preconditions and never duplicates an uncertain create after a newer read', async () => {
  const perform = vi.fn<DecisionPerformer>().mockRejectedValue(new Error('lost response'));
  const editor = createDecisionEditor(sourceDecision(), perform);
  const command = { kind: 'add-option' as const, fields: { title: 'Afternoon' } };
  expect(await editor.commit(command, 'Add')).toBe(false);
  const failure = editor.getState().failures[0];
  if (!failure) throw new Error('Missing failure');
  editor.receive(sourceDecision(1));
  expect(await editor.retry(failure)).toBe(false);
  expect(await editor.commit(command, 'Add')).toBe(false);
  expect(perform).toHaveBeenCalledTimes(1);
  expect(editor.getState().undoCount).toBe(0);
});
it('retains a transiently failed inverse and retries its original revision after an unchanged reload', async () => {
  const perform = vi
    .fn<DecisionPerformer>()
    .mockResolvedValueOnce(success(1))
    .mockRejectedValueOnce(new Error('lost inverse'))
    .mockResolvedValueOnce(success(2));
  const editor = createDecisionEditor(sourceDecision(), perform);
  await editor.commit(edit, 'Edit');
  expect(await editor.undo()).toBe(false);
  const failure = editor.getState().failures.at(-1);
  if (!failure) throw new Error('Missing inverse failure');
  expect(editor.getState().undoCount).toBe(1);
  editor.reload(sourceDecision(1));
  expect(await editor.retry(failure)).toBe(true);
  expect(perform.mock.calls.slice(1).map(([source]) => source.decision.revision)).toEqual([1, 1]);
  expect(editor.getState()).toMatchObject({
    undoCount: 0,
    failures: [],
    source: { decision: { revision: 2 } },
  });
});
it('clears stale history on an actual revision conflict and rejects unrelated success revisions', async () => {
  const perform = vi
    .fn<DecisionPerformer>()
    .mockResolvedValueOnce(success(1))
    .mockRejectedValueOnce(
      new ApiError({
        code: 'trips.decision.decision_revision_conflict',
        kind: 'client',
        status: 409,
        message: 'Changed source',
        retryable: false,
      })
    );
  const editor = createDecisionEditor(sourceDecision(), perform);
  await editor.commit(edit, 'Edit');
  expect(await editor.undo()).toBe(false);
  expect(editor.getState()).toMatchObject({ undoCount: 0, conflict: true });
  expect(await editor.undo()).toBe(false);
  expect(perform).toHaveBeenCalledTimes(2);
  const invalid = createDecisionEditor(
    sourceDecision(),
    vi.fn<DecisionPerformer>().mockResolvedValue(success(5))
  );
  expect(await invalid.commit(edit, 'Edit')).toBe(false);
  expect(invalid.getState().source.decision.revision).toBe(0);
});
it('does not retry an uncertain inverse after a canonical read proves that another revision already exists', async () => {
  const perform = vi
    .fn<DecisionPerformer>()
    .mockResolvedValueOnce(success(1))
    .mockRejectedValueOnce(new Error('lost response'));
  const editor = createDecisionEditor(sourceDecision(), perform);
  await editor.commit(edit, 'Edit');
  await editor.undo();
  const failure = editor.getState().failures.at(-1);
  if (!failure) throw new Error('Missing inverse failure');
  editor.receive(sourceDecision(2));
  expect(await editor.retry(failure)).toBe(false);
  expect(editor.getState().undoCount).toBe(0);
  expect(perform).toHaveBeenCalledTimes(2);
});
it('handles a newer canonical read arriving during a mutation without adopting it for Undo', async () => {
  let resolve: (result: AppliedDecisionChange) => void = () => {
    throw new Error('not started');
  };
  const editor = createDecisionEditor(
    sourceDecision(),
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const pending = editor.commit(edit, 'Edit');
  editor.receive(sourceDecision(4));
  resolve(success(1));
  await pending;
  expect(editor.getState()).toMatchObject({ undoCount: 0, source: { decision: { revision: 4 } } });
});
