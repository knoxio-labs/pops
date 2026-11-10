import { expect, it, vi } from 'vitest';

import { createCaptureEditor } from './editor';
import { captureResult, captureSource, deferred, sourceCapture } from './test-utils';

import type { CapturePerformer, CaptureResult } from './types';

it('preserves unicode and whitespace verbatim without inferring URL or classification', async () => {
  const perform = vi
    .fn<CapturePerformer>()
    .mockImplementation(async (request) => captureResult(request));
  const editor = createCaptureEditor({ source: captureSource(), tripId: 1, perform });
  editor.editDraft({
    originalText: '  東京\nhttps://example.test/ café\t',
    originalUrl: ' https://example.test/raw ',
  });
  expect(await editor.capture()).toBe(true);
  expect(perform.mock.calls[0]?.[0].command).toMatchObject({
    kind: 'capture.create',
    input: {
      originalText: '  東京\nhttps://example.test/ café\t',
      originalUrl: ' https://example.test/raw ',
      classification: null,
      placeId: null,
      visitId: null,
    },
  });
  expect(editor.getState().draft.originalText).toBe('');
});

it('blocks an unaccepted file while preserving separate same-name selections', async () => {
  const perform = vi
    .fn<CapturePerformer>()
    .mockImplementation(async (request) => captureResult(request));
  const editor = createCaptureEditor({ source: captureSource(), tripId: 1, perform });
  const first = new File(['first'], 'ticket.pdf', { type: 'application/pdf' });
  const second = new File(['second'], 'ticket.pdf', { type: 'application/pdf' });
  const a = editor.addSelection({
    file: first,
    name: first.name,
    mediaType: first.type,
    references: [],
  });
  const b = editor.addSelection({
    file: second,
    name: second.name,
    mediaType: second.type,
    references: [],
  });
  if (!a || !b) throw new Error('Missing selections');
  expect(a).not.toBe(b);
  editor.acceptAttachment(a, { kind: 'task', taskId: 'accepted-one' });
  expect(await editor.capture()).toBe(false);
  expect(perform).not.toHaveBeenCalled();
  expect(editor.getState().draft.selections[1]?.file).toBe(second);
  editor.removeSelection(b);
  expect(await editor.capture()).toBe(true);
  expect(perform.mock.calls[0]?.[0].command).toMatchObject({
    input: { originalText: '', attachments: [{ kind: 'task', taskId: 'accepted-one' }] },
  });
});

it('does not clear newer draft material when an older capture response arrives', async () => {
  const response = deferred<CaptureResult>();
  const perform = vi.fn<CapturePerformer>().mockReturnValue(response.promise);
  const editor = createCaptureEditor({ source: captureSource(), tripId: 1, perform });
  editor.editDraft({ originalText: 'First source' });
  const pending = editor.capture();
  expect(await editor.capture()).toBe(false);
  editor.editDraft({ originalText: 'Newer material' });
  const request = perform.mock.calls[0]?.[0];
  if (!request) throw new Error('Missing request');
  response.resolve(captureResult(request, captureSource([sourceCapture()])));
  expect(await pending).toBe(true);
  expect(editor.getState().draft.originalText).toBe('Newer material');
  expect(editor.getState().undoCount).toBe(1);
});

it('ignores stale reads and rejects cross-trip responses without losing the draft', async () => {
  const perform = vi
    .fn<CapturePerformer>()
    .mockImplementation(async (request) =>
      captureResult(request, captureSource([sourceCapture()]))
    );
  const editor = createCaptureEditor({ source: captureSource(), tripId: 1, perform });
  editor.editDraft({ originalText: 'Source' });
  await editor.capture();
  editor.receive(captureSource(), 0);
  expect(editor.getState().source.captures).toHaveLength(1);
  editor.editDraft({ originalText: 'Retain this' });
  perform.mockImplementation(async (request) =>
    captureResult(request, captureSource([sourceCapture({ tripId: 2 })]))
  );
  expect(await editor.capture()).toBe(false);
  expect(editor.getState().draft.originalText).toBe('Retain this');
  expect(editor.getState().source.captures[0]?.tripId).toBe(1);
});
