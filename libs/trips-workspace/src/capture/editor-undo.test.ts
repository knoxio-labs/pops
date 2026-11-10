import { expect, it, vi } from 'vitest';

import { createCaptureEditor } from './editor';
import { captureResult, captureSource, deferred } from './test-utils';

import type { CapturePerformer, CaptureResult } from './types';

it('restores exact File handles and newly accepted provenance, then recaptures under a fresh UUID', async () => {
  const perform = vi
    .fn<CapturePerformer>()
    .mockImplementation(async (request) => captureResult(request));
  const editor = createCaptureEditor({ source: captureSource(), tripId: 1, perform });
  const file = new File(['private bytes'], 'original.pdf', { type: 'application/pdf' });
  const id = editor.addSelection({ file, name: file.name, mediaType: file.type, references: [] });
  if (!id) throw new Error('Missing selection');
  editor.acceptAttachment(id, { kind: 'task', taskId: 'accepted-task' });
  editor.editDraft({ originalText: '  Original\nsource ', classification: 'document' });
  expect(await editor.capture()).toBe(true);
  editor.acceptAttachment(id, { kind: 'document', documentId: 42, taskId: 'accepted-task' });
  expect(await editor.undo()).toBe(true);
  expect(editor.getState().draft.selections[0]?.file).toBe(file);
  expect(editor.getState().draft.originalText).toBe('  Original\nsource ');
  expect(await editor.capture()).toBe(true);
  expect(perform.mock.calls[2]?.[0].operationId).not.toBe(perform.mock.calls[0]?.[0].operationId);
  expect(perform.mock.calls[2]?.[0].command).toMatchObject({
    input: {
      attachments: [
        { kind: 'task', taskId: 'accepted-task' },
        { kind: 'document', documentId: 42, taskId: 'accepted-task' },
      ],
    },
  });
});

it('retains both drafts and sends no inverse while the current composer has material', async () => {
  const perform = vi
    .fn<CapturePerformer>()
    .mockImplementation(async (request) => captureResult(request));
  const editor = createCaptureEditor({ source: captureSource(), tripId: 1, perform });
  editor.editDraft({ originalText: 'Saved source' });
  await editor.capture();
  editor.editDraft({ classification: 'note' });
  expect(await editor.undo()).toBe(false);
  expect(perform).toHaveBeenCalledTimes(1);
  expect(editor.getState()).toMatchObject({
    draft: { classification: 'note' },
    undoCount: 1,
    failure: { error: { message: 'Finish or clear the current draft before undoing capture.' } },
  });
  editor.clearDraft();
  expect(await editor.retry()).toBe(true);
  expect(editor.getState().draft.originalText).toBe('Saved source');
});

it('reserves the composer across an uncertain inverse and unlocks only after exact replay is confirmed', async () => {
  const response = deferred<CaptureResult>();
  const perform = vi
    .fn<CapturePerformer>()
    .mockImplementationOnce(async (request) => captureResult(request))
    .mockReturnValueOnce(response.promise)
    .mockImplementation(async (request) => captureResult(request));
  const editor = createCaptureEditor({ source: captureSource(), tripId: 1, perform });
  editor.editDraft({ originalText: 'Submitted source' });
  await editor.capture();
  const undo = editor.undo();
  expect(editor.editDraft({ originalText: 'Must be blocked' })).toBe(false);
  expect(
    editor.addSelection({
      file: null,
      name: 'Selected original',
      mediaType: null,
      references: [{ kind: 'document', documentId: 8 }],
    })
  ).toBeUndefined();
  response.reject(new Error('Lost inverse response'));
  expect(await undo).toBe(false);
  expect(editor.getState().composerLocked).toBe(true);
  expect(await editor.capture()).toBe(false);
  expect(await editor.retry()).toBe(true);
  expect(perform.mock.calls[2]?.[0]).toEqual(perform.mock.calls[1]?.[0]);
  expect(editor.getState()).toMatchObject({
    composerLocked: false,
    undoCount: 0,
    draft: { originalText: 'Submitted source' },
  });
});
