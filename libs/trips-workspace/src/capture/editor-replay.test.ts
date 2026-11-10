import { expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { createCaptureEditor } from './editor';
import { captureResult, captureSource, sourceCapture } from './test-utils';

import type { CapturePerformer } from './types';

it('retries a lost capture response with the original UUID and payload despite a later source read', async () => {
  const perform = vi
    .fn<CapturePerformer>()
    .mockRejectedValueOnce(new Error('Lost response'))
    .mockImplementation(async (request) => ({ ...captureResult(request), replayed: true }));
  const editor = createCaptureEditor({ source: captureSource(), tripId: 1, perform });
  editor.editDraft({ originalText: 'Original intent' });
  expect(await editor.capture()).toBe(false);
  editor.receive(captureSource([sourceCapture()]), 0);
  editor.editDraft({ originalText: 'New material' });
  expect(await editor.capture()).toBe(false);
  expect(await editor.retry()).toBe(true);
  expect(perform.mock.calls[1]?.[0]).toEqual(perform.mock.calls[0]?.[0]);
  expect(editor.getState()).toMatchObject({
    draft: { originalText: 'New material' },
    undoCount: 1,
  });
});

it('keeps an already-undone replay distinct from a new capture and preserves the composer', async () => {
  const perform = vi
    .fn<CapturePerformer>()
    .mockRejectedValueOnce(new Error('Lost response'))
    .mockImplementation(async (request) => ({
      ...captureResult(request),
      undone: true,
      replayed: true,
    }));
  const editor = createCaptureEditor({ source: captureSource(), tripId: 1, perform });
  editor.editDraft({ originalText: 'Recoverable source' });
  await editor.capture();
  expect(await editor.retry()).toBe(false);
  expect(editor.getState()).toMatchObject({
    draft: { originalText: 'Recoverable source' },
    undoCount: 0,
    failure: { error: { code: 'trips.capture.already_undone' }, canRetry: false },
  });
  perform.mockImplementation(async (request) => captureResult(request));
  expect(await editor.capture()).toBe(true);
  expect(perform.mock.calls[2]?.[0].operationId).not.toBe(perform.mock.calls[0]?.[0].operationId);
});

it('retains a confirmed conflict inverse and never substitutes a refreshed foreign revision', async () => {
  const perform = vi
    .fn<CapturePerformer>()
    .mockImplementationOnce(async (request) => captureResult(request))
    .mockRejectedValueOnce(
      new ApiError({
        code: 'trips.capture.source_undo_conflict',
        kind: 'client',
        status: 409,
        message: 'Changed elsewhere',
        retryable: false,
      })
    )
    .mockRejectedValue(
      new ApiError({
        code: 'trips.capture.source_undo_conflict',
        kind: 'client',
        status: 409,
        message: 'Changed elsewhere',
        retryable: false,
      })
    );
  const editor = createCaptureEditor({ source: captureSource(), tripId: 1, perform });
  await editor.commit(
    { kind: 'capture.update', id: 1, expectedRevision: 1, input: { notes: 'Owned edit' } },
    'Edit'
  );
  expect(await editor.undo()).toBe(false);
  editor.receive(captureSource([sourceCapture({ revision: 17, notes: 'Foreign material' })]), 1);
  expect(await editor.retry()).toBe(false);
  expect(perform.mock.calls[2]?.[0]).toEqual(perform.mock.calls[1]?.[0]);
  expect(editor.getState()).toMatchObject({
    undoCount: 1,
    source: { captures: [{ revision: 17, notes: 'Foreign material' }] },
  });
});
