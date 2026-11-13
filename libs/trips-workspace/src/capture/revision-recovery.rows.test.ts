import { expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { createCaptureEditor } from './editor';
import { CaptureRecordDrafts } from './record-drafts';
import { captureResult, captureSource, sourceCapture, sourceIdea } from './test-utils';

import type { CaptureEditor } from './editor-types';
import type { CapturePerformer, CaptureSource } from './types';

function fixture() {
  const capture = sourceCapture({ id: 1 });
  const idea = sourceIdea({ id: 1 });
  const source = { ...captureSource([capture]), ideas: [idea] };
  const conflict = new ApiError({
    code: 'trips.source.source_revision_conflict',
    kind: 'client',
    status: 409,
    message: 'Changed elsewhere',
    retryable: false,
  });
  const perform = vi.fn<CapturePerformer>().mockRejectedValue(conflict);
  const editor = createCaptureEditor({ source, tripId: 1, perform });
  const drafts = new CaptureRecordDrafts(editor);
  drafts.editIdea(idea, { notes: 'Idea draft' });
  drafts.editCapture(capture, { notes: 'Capture draft' });
  const current = {
    ...source,
    captures: [sourceCapture({ id: 1, revision: 3, notes: 'Canonical capture' })],
    ideas: [sourceIdea({ id: 1, revision: 4, notes: 'Canonical Idea' })],
  };
  return { editor, drafts, perform, source, current };
}

function reload(editor: CaptureEditor, source: CaptureSource): boolean {
  const token = editor.beginConflictReload();
  if (!token) throw new Error('Missing retained conflict');
  return editor.completeConflictReload(token, source);
}

it('retains both kinds with the same numeric ID through two rejections and discards only each freshly read row', async () => {
  const { editor, drafts, perform, current } = fixture();
  expect(await drafts.saveIdea(1)).toBe(false);
  expect(await drafts.saveCapture(1)).toBe(false);
  expect(await drafts.saveIdea(1)).toBe(false);
  expect(await drafts.saveCapture(1)).toBe(false);
  expect(perform).toHaveBeenCalledTimes(2);
  drafts.discard('idea', 1);
  drafts.discard('capture', 1);
  expect(drafts.idea(1)?.input.notes).toBe('Idea draft');
  expect(drafts.capture(1)?.input.notes).toBe('Capture draft');
  expect(reload(editor, { ...current, ideas: [sourceIdea({ tripId: 2, revision: 4 })] })).toBe(
    false
  );
  expect(editor.canDiscardRejectedEdit('idea', 1)).toBe(false);
  expect(editor.canDiscardRejectedEdit('capture', 1)).toBe(false);
  expect(reload(editor, current)).toBe(true);
  drafts.discard('idea', 1);
  expect(drafts.idea(1)?.input.notes).toBe('Idea draft');
  drafts.discard('capture', 1);
  expect(drafts.capture(1)).toBeUndefined();
  expect(editor.getState().failure).toMatchObject({ label: 'Edit Idea', reloadSource: true });
  expect(await drafts.saveIdea(1)).toBe(false);
  expect(perform).toHaveBeenCalledTimes(2);
  expect(reload(editor, current)).toBe(true);
  expect(drafts.idea(1)?.input.notes).toBe('Idea draft');
  drafts.discard('idea', 1);
  expect(drafts.idea(1)).toBeUndefined();
  expect(editor.getState().failure).toBeNull();
  perform.mockImplementation(async (request) =>
    captureResult(request, {
      ...current,
      ideas: [sourceIdea({ id: 1, revision: 5, notes: 'Fresh edit' })],
    })
  );
  const idea = current.ideas[0];
  if (!idea) throw new Error('Missing current Idea');
  drafts.editIdea(idea, { notes: 'Fresh edit' });
  expect(await drafts.saveIdea(1)).toBe(true);
  const rejected = perform.mock.calls[0]?.[0];
  const fresh = perform.mock.calls[2]?.[0];
  expect(fresh?.operationId).not.toBe(rejected?.operationId);
  expect(fresh?.command).toMatchObject({ kind: 'idea.update', id: 1, expectedRevision: 4 });
});

it('preserves an unrelated unknown request and its exact Retry while a retained conflict waits', async () => {
  const { editor, drafts, perform, source, current } = fixture();
  await drafts.saveIdea(1);
  perform.mockRejectedValueOnce(new Error('Lost response'));
  expect(await drafts.saveCapture(1)).toBe(false);
  const pending = editor.getPendingRequest();
  expect(pending?.command).toMatchObject({ kind: 'capture.update', id: 1 });
  expect(editor.getState().failure).toMatchObject({ label: 'Edit capture', canRetry: true });
  expect(editor.beginConflictReload()).toBeNull();
  drafts.discard('idea', 1);
  drafts.discard('capture', 1);
  expect(drafts.idea(1)?.input.notes).toBe('Idea draft');
  expect(drafts.capture(1)?.input.notes).toBe('Capture draft');
  expect(await drafts.saveIdea(1)).toBe(false);
  expect(editor.getPendingRequest()).toEqual(pending);
  perform.mockImplementationOnce(async (request) =>
    captureResult(request, {
      ...source,
      captures: [sourceCapture({ id: 1, revision: 2, notes: 'Capture draft' })],
    })
  );
  expect(await editor.retry()).toBe(true);
  expect(perform.mock.calls[2]?.[0]).toEqual(pending);
  expect(editor.getPendingRequest()).toBeNull();
  expect(editor.getState().failure).toMatchObject({ label: 'Edit Idea', reloadSource: true });
  expect(await drafts.saveIdea(1)).toBe(false);
  expect(perform).toHaveBeenCalledTimes(3);
  expect(reload(editor, current)).toBe(true);
  expect(drafts.idea(1)?.input.notes).toBe('Idea draft');
  drafts.discard('idea', 1);
  expect(drafts.idea(1)).toBeUndefined();
});

it('retains two Idea identities independently within the same trip and restores the exact remaining rejection', async () => {
  const { source, perform } = fixture();
  const rows = [sourceIdea({ id: 1 }), sourceIdea({ id: 2 })];
  const editor = createCaptureEditor({ source: { ...source, ideas: rows }, tripId: 1, perform });
  const drafts = new CaptureRecordDrafts(editor);
  for (const row of rows) {
    drafts.editIdea(row, { notes: `Local ${row.id}` });
    expect(await drafts.saveIdea(row.id)).toBe(false);
  }
  for (const row of rows) expect(await drafts.saveIdea(row.id)).toBe(false);
  expect(perform).toHaveBeenCalledTimes(2);
  const current = { ...source, ideas: rows.map((row) => ({ ...row, revision: 3 })) };
  expect(reload(editor, current)).toBe(true);
  drafts.discard('idea', 1);
  expect(drafts.idea(1)?.input.notes).toBe('Local 1');
  drafts.discard('idea', 2);
  expect(drafts.idea(2)).toBeUndefined();
  const token = editor.beginConflictReload();
  if (!token) throw new Error('Missing first Idea conflict');
  expect(token.operationId).toBe(perform.mock.calls[0]?.[0].operationId);
  expect(editor.completeConflictReload(token, current)).toBe(true);
  expect(drafts.idea(1)?.input.notes).toBe('Local 1');
  drafts.discard('idea', 1);
  expect(drafts.idea(1)).toBeUndefined();
  expect(editor.getState().failure).toBeNull();
});
