import { expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { createCaptureEditor } from './editor';
import { CaptureRecordDrafts } from './record-drafts';
import { captureResult, captureSource, sourceCapture, sourceIdea } from './test-utils';

import type { CapturePerformer } from './types';

function fixture(
  error: Error = new ApiError({
    code: 'trips.source.source_revision_conflict',
    kind: 'client',
    status: 409,
    message: 'Changed elsewhere',
    retryable: false,
  })
) {
  const source = { ...captureSource([sourceCapture({ id: 2 })]), ideas: [sourceIdea()] };
  const perform = vi
    .fn<CapturePerformer>()
    .mockRejectedValueOnce(error)
    .mockImplementation(async (request) =>
      captureResult(request, {
        ...source,
        ideas: [sourceIdea({ revision: 4, notes: 'New explicit edit' })],
      })
    );
  const editor = createCaptureEditor({ source, tripId: 1, perform });
  const drafts = new CaptureRecordDrafts(editor);
  const row = source.ideas[0];
  if (!row) throw new Error('Missing fixture Idea');
  drafts.editIdea(row, { notes: 'Retained local fields' });
  return { source, perform, editor, drafts, row };
}

it('requires fresh owner source then explicit row discard before a new UUID/current-CAS edit', async () => {
  const { source, perform, editor, drafts, row } = fixture();
  const other = source.captures[0];
  if (!other) throw new Error('Missing other row');
  drafts.editCapture(other, { notes: 'Independent draft' });
  expect(await drafts.saveIdea(row.id)).toBe(false);
  expect(editor.getState().failure).toMatchObject({ canRetry: false, reloadSource: true });
  expect(await editor.retry()).toBe(false);
  expect(await drafts.saveIdea(row.id)).toBe(false);
  expect(perform).toHaveBeenCalledTimes(1);
  drafts.discard('idea', row.id);
  expect(drafts.idea(row.id)?.input.notes).toBe('Retained local fields');
  const token = editor.beginConflictReload();
  if (!token) throw new Error('Missing conflict token');
  const current = sourceIdea({ revision: 3, notes: 'Canonical foreign note' });
  expect(editor.completeConflictReload(token, { ...source, ideas: [current] })).toBe(true);
  expect(drafts.idea(row.id)).toEqual({ revision: 1, input: { notes: 'Retained local fields' } });
  expect(await drafts.saveIdea(row.id)).toBe(false);
  expect(perform).toHaveBeenCalledTimes(1);
  drafts.discard('idea', row.id);
  expect(drafts.idea(row.id)).toBeUndefined();
  expect(editor.getState().failure).toBeNull();
  expect(drafts.capture(other.id)?.input.notes).toBe('Independent draft');
  drafts.editIdea(current, { notes: 'New explicit edit' });
  expect(await drafts.saveIdea(row.id)).toBe(true);
  const first = perform.mock.calls[0]?.[0];
  const next = perform.mock.calls[1]?.[0];
  expect(next?.operationId).not.toBe(first?.operationId);
  expect(next?.command).toEqual({
    kind: 'idea.update',
    id: row.id,
    expectedRevision: 3,
    input: { notes: 'New explicit edit' },
  });
});

it('does not discard an ambiguous request and keeps exact Retry even after source reads', async () => {
  const { source, perform, editor, drafts, row } = fixture(new Error('Lost response'));
  expect(await drafts.saveIdea(row.id)).toBe(false);
  expect(editor.beginConflictReload()).toBeNull();
  editor.receive({ ...source, ideas: [sourceIdea({ revision: 3 })] }, 0);
  drafts.discard('idea', row.id);
  expect(drafts.idea(row.id)?.input.notes).toBe('Retained local fields');
  expect(editor.getPendingRequest()).toEqual(perform.mock.calls[0]?.[0]);
  await editor.retry();
  expect(perform.mock.calls[1]?.[0]).toEqual(perform.mock.calls[0]?.[0]);
});

it('rejects stale, foreign, missing, removed and superseded reload proof without dropping either intent', async () => {
  const { source, editor, drafts, row } = fixture();
  await drafts.saveIdea(row.id);
  const old = editor.beginConflictReload();
  const latest = editor.beginConflictReload();
  if (!old || !latest) throw new Error('Missing conflict tokens');
  expect(editor.completeConflictReload(old, source)).toBe(false);
  for (const invalid of [
    { ...source, ideas: [sourceIdea({ tripId: 2, revision: 3 })] },
    { ...source, ideas: [] },
    { ...source, ideas: [sourceIdea({ revision: 0 })] },
    { ...source, ideas: [sourceIdea({ revision: 3, removedAt: '2026-11-10T00:00:00Z' })] },
  ])
    expect(editor.completeConflictReload(latest, invalid)).toBe(false);
  expect(editor.canDiscardRejectedEdit('idea', row.id)).toBe(false);
  expect(
    editor.completeConflictReload(latest, { ...source, ideas: [sourceIdea({ revision: 3 })] })
  ).toBe(true);
  editor.receive(
    { ...source, ideas: [sourceIdea({ revision: 4, notes: 'New foreign change' })] },
    0
  );
  expect(editor.canDiscardRejectedEdit('idea', row.id)).toBe(false);
  drafts.discard('idea', row.id);
  expect(drafts.idea(row.id)?.input.notes).toBe('Retained local fields');
  expect(editor.getState().failure?.reloadSource).toBe(true);
});

it.each([4, 3])(
  'rejects late explicit reload after an admitted canonical read, including equal-revision changes: %s',
  async (revision) => {
    const { source, editor, drafts, row } = fixture();
    await drafts.saveIdea(row.id);
    const token = editor.beginConflictReload();
    if (!token) throw new Error('Missing conflict token');
    const newer = {
      ...source,
      ideas: [sourceIdea({ revision, notes: 'Newer admitted canonical value' })],
    };
    editor.receive(newer, 0);
    const late = { ...source, ideas: [sourceIdea({ revision: 3, notes: 'Older response' })] };
    expect(editor.completeConflictReload(token, late)).toBe(false);
    expect(editor.getState().source).toEqual(newer);
    expect(editor.canDiscardRejectedEdit('idea', row.id)).toBe(false);
    drafts.discard('idea', row.id);
    expect(drafts.idea(row.id)?.input.notes).toBe('Retained local fields');
    expect(editor.getState().failure?.reloadSource).toBe(true);
  }
);

it('keeps unrelated source rows usable despite a rejected Idea update', async () => {
  const { source, perform, editor, drafts, row } = fixture();
  await drafts.saveIdea(row.id);
  perform.mockImplementationOnce(async (request) =>
    captureResult(request, {
      ...source,
      captures: [sourceCapture({ id: 2, revision: 2, notes: 'Independent source edit' })],
    })
  );
  expect(
    await editor.commit(
      {
        kind: 'capture.update',
        id: 2,
        expectedRevision: 1,
        input: { notes: 'Independent source edit' },
      },
      'Edit capture'
    )
  ).toBe(true);
  expect(perform.mock.calls[1]?.[0].command).toEqual({
    kind: 'capture.update',
    id: 2,
    expectedRevision: 1,
    input: { notes: 'Independent source edit' },
  });
  expect(drafts.idea(row.id)?.input.notes).toBe('Retained local fields');
  expect(await drafts.saveIdea(row.id)).toBe(false);
  expect(perform).toHaveBeenCalledTimes(2);
  expect(editor.getState().failure?.reloadSource).toBe(true);
  const token = editor.beginConflictReload();
  if (!token) throw new Error('Missing retained conflict token');
  const current = sourceIdea({ revision: 3, notes: 'Canonical note' });
  expect(
    editor.completeConflictReload(token, { ...editor.getState().source, ideas: [current] })
  ).toBe(true);
  expect(await drafts.saveIdea(row.id)).toBe(false);
  expect(perform).toHaveBeenCalledTimes(2);
  drafts.discard('idea', row.id);
  expect(drafts.idea(row.id)).toBeUndefined();
  drafts.editIdea(current, { notes: 'New explicit edit' });
  expect(await drafts.saveIdea(row.id)).toBe(true);
  const rejected = perform.mock.calls[0]?.[0];
  const fresh = perform.mock.calls[2]?.[0];
  expect(fresh?.operationId).not.toBe(rejected?.operationId);
  expect(fresh?.command).toMatchObject({ kind: 'idea.update', id: row.id, expectedRevision: 3 });
});
