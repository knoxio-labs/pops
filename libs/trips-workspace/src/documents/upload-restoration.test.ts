import { expect, it, vi } from 'vitest';

import { CaptureBrowserSession } from '../capture/browser-session';
import { captureResult, captureSource } from '../capture/test-utils';
import { createClient as createTripsClient } from '../trips-api/client';
import { createDurableUploadWire } from './durable-upload-wire-test-utils';
import { createTripDocumentUploadSession } from './trip-document-upload-session';
import { UploadRestoration } from './upload-restoration';

import type { DurableUploadInput } from './durable-upload-api';

function input(operationId: string): DurableUploadInput {
  return {
    operationId,
    fileName: 'original.pdf',
    mimeType: 'application/pdf',
    byteLength: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  };
}

it('keeps null and unseen binding snapshots stable without borrowing another binding outcome', () => {
  const restoration = new UploadRestoration(vi.fn());
  const pending = restoration.readFor(null);
  expect(restoration.readFor('A')).toBe(pending);
  restoration.run('A', () => undefined, 'Fallback');
  expect(restoration.readFor('A')).toEqual({ binding: 'A', error: null });
  expect(restoration.readFor('B')).toBe(pending);
  expect(restoration.readFor(null)).toBe(pending);
});

it('always invokes restoration after success but publishes only a changed immutable outcome', () => {
  const notify = vi.fn();
  const restore = vi.fn();
  const restoration = new UploadRestoration(notify);
  restoration.run('A', restore, 'Fallback');
  const before = restoration.readFor('A');
  restoration.run('A', restore, 'Fallback');
  expect(restore).toHaveBeenCalledTimes(2);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(restoration.readFor('A')).toBe(before);
  expect(Object.isFrozen(before)).toBe(true);
});

it('rethrows the identical original failure while retaining its own error outcome independently of B', () => {
  const notify = vi.fn();
  const restoration = new UploadRestoration(notify);
  const failure = new Error('Storage unavailable');
  let observed: unknown;
  try {
    restoration.run(
      'A',
      () => {
        throw failure;
      },
      'Fallback'
    );
  } catch (error) {
    observed = error;
  }
  expect(observed).toBe(failure);
  const a = restoration.readFor('A');
  expect(a).toEqual({ binding: 'A', error: failure.message });
  restoration.run('B', () => undefined, 'Fallback');
  expect(restoration.readFor('A')).toBe(a);
  expect(restoration.readFor('B')).toEqual({ binding: 'B', error: null });
  restoration.run('A', () => undefined, 'Fallback');
  expect(restoration.readFor('A')).toEqual({ binding: 'A', error: null });
  expect(notify).toHaveBeenCalledTimes(3);
});

it('keeps queue restoration with its retained owner and discovers newly admitted descriptors on repeat', () => {
  const owner = createDurableUploadWire();
  const session = createTripDocumentUploadSession({
    tripId: 7,
    target: { kind: 'stay', id: 8 },
    tripsClient: createTripsClient({ baseUrl: 'https://owner-a.test/trips-api' }),
    documentsClient: owner.client,
  });
  const journal = owner.createJournal({
    tripId: 7,
    target: session.context.target,
    tripsOrigin: 'https://owner-a.test/trips-api',
    documentsOrigin: 'https://owner-a.test/documents-api',
  });
  const notify = vi.fn();
  const other = vi.fn();
  const unsubscribe = session.subscribe(notify);
  session.subscribe(other);
  session.restore(journal);
  const ready = session.uploadRestoration.readFor(journal.bindingKey());
  session.restore(journal);
  expect(notify).toHaveBeenCalledTimes(1);
  const descriptor = input('ab88a8e8-f685-4d47-8d4c-a7e3eb8fdb08');
  journal.admit(descriptor);
  unsubscribe();
  session.restore(journal);
  expect(session.read()[0]?.upload.intent.durable.readInput()).toEqual(descriptor);
  expect(session.read()[0]?.file).toBeNull();
  expect(session.uploadRestoration.readFor(journal.bindingKey())).toBe(ready);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(other).toHaveBeenCalledTimes(2);
  owner.client.setConfig({ baseUrl: 'https://other.test/documents-api' });
  expect(() => session.restore(journal)).toThrow();
  expect(session.uploadRestoration.readFor(journal.bindingKey()).error).not.toBeNull();
  expect(session.read()).toHaveLength(1);
  expect(owner.requests).toHaveLength(0);
});

it('retains composer restoration outcomes and rereads the same journal for later descriptors', () => {
  const owner = createDurableUploadWire();
  const session = new CaptureBrowserSession(captureSource(), 7, async (request) =>
    captureResult(request)
  );
  const journal = owner.persistence.journal;
  const notify = vi.fn();
  session.subscribe(notify);
  session.restoreUploads(journal);
  const ready = session.uploadRestoration.readFor(journal.bindingKey());
  journal.admit(input('ab88a8e8-f685-4d47-8d4c-a7e3eb8fdb08'));
  session.restoreUploads(journal);
  expect(session.editor.getState().draft.selections).toHaveLength(1);
  expect(session.uploadRestoration.readFor(journal.bindingKey())).toBe(ready);
  owner.persistence.retire();
  expect(() => session.restoreUploads(journal)).toThrow();
  expect(session.uploadRestoration.readFor(journal.bindingKey()).error).not.toBeNull();
  expect(session.editor.getState().draft.selections).toHaveLength(1);
  expect(notify).toHaveBeenCalledTimes(3);
  expect(owner.requests).toHaveLength(0);
});
