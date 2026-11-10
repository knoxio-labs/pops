import { expect, it, vi } from 'vitest';

import { createCaptureEditor } from './editor';
import { CaptureRecordDrafts } from './record-drafts';
import { captureResult, captureSource, deferred, sourceCapture } from './test-utils';

import type { CapturePerformer, CaptureResult } from './types';

it('retains failed row fields and original revision through refetch and clears only a matching confirmed retry', async () => {
  const row = sourceCapture();
  const perform = vi
    .fn<CapturePerformer>()
    .mockRejectedValueOnce(new Error('Response lost'))
    .mockImplementation(async (request) =>
      captureResult(request, captureSource([sourceCapture({ revision: 2, notes: 'Own note' })]))
    );
  const editor = createCaptureEditor({ source: captureSource([row]), tripId: 1, perform });
  const drafts = new CaptureRecordDrafts(editor);
  drafts.editCapture(row, { notes: 'Own note' });
  expect(await drafts.saveCapture(row.id)).toBe(false);
  editor.receive(captureSource([sourceCapture({ revision: 9 })]), 0);
  expect(drafts.capture(row.id)).toEqual({ revision: 1, input: { notes: 'Own note' } });
  expect(await editor.retry()).toBe(true);
  expect(perform.mock.calls[1]?.[0]).toEqual(perform.mock.calls[0]?.[0]);
  expect(drafts.capture(row.id)).toBeUndefined();
});

it('keeps newer unsaved row fields when an older acknowledgement arrives', async () => {
  const response = deferred<CaptureResult>();
  const perform = vi.fn<CapturePerformer>().mockReturnValue(response.promise);
  const row = sourceCapture();
  const editor = createCaptureEditor({ source: captureSource([row]), tripId: 1, perform });
  const drafts = new CaptureRecordDrafts(editor);
  drafts.editCapture(row, { notes: 'First note' });
  const pending = drafts.saveCapture(row.id);
  drafts.editCapture(row, { notes: 'Newer unsaved note' });
  const request = perform.mock.calls[0]?.[0];
  if (!request) throw new Error('Missing request');
  response.resolve(
    captureResult(request, captureSource([sourceCapture({ revision: 2, notes: 'First note' })]))
  );
  expect(await pending).toBe(true);
  expect(drafts.capture(row.id)).toEqual({ revision: 1, input: { notes: 'Newer unsaved note' } });
});

it('does not clear an intent from a replay whose current source was overwritten by another writer', async () => {
  const row = sourceCapture();
  const perform = vi.fn<CapturePerformer>().mockImplementation(async (request) => ({
    ...captureResult(
      request,
      captureSource([sourceCapture({ revision: 5, notes: 'Foreign note' })])
    ),
    replayed: true,
  }));
  const editor = createCaptureEditor({ source: captureSource([row]), tripId: 1, perform });
  const drafts = new CaptureRecordDrafts(editor);
  drafts.editCapture(row, { notes: 'Own note' });
  expect(await drafts.saveCapture(row.id)).toBe(true);
  expect(drafts.capture(row.id)?.input.notes).toBe('Own note');
});

it('preserves explicit organisation input and precondition while another source read changes the capture', async () => {
  const row = sourceCapture({ classification: 'event' });
  const perform = vi.fn<CapturePerformer>().mockRejectedValue(new Error('Unknown outcome'));
  const editor = createCaptureEditor({ source: captureSource([row]), tripId: 1, perform });
  const drafts = new CaptureRecordDrafts(editor);
  drafts.chooseTarget(row, {
    mode: 'createJourney',
    input: { name: 'Explicit independent journey' },
  });
  expect(await drafts.organise(row.id)).toBe(false);
  editor.receive(captureSource([sourceCapture({ revision: 3 })]), 0);
  expect(drafts.organisation(row.id)).toEqual({
    revision: 1,
    target: { mode: 'createJourney', input: { name: 'Explicit independent journey' } },
  });
  expect(await editor.retry()).toBe(false);
  expect(perform.mock.calls[1]?.[0]).toEqual(perform.mock.calls[0]?.[0]);
});
